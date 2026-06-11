package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/jlaffaye/ftp"
)

type FTPConfig struct {
	Host       string `json:"host"`
	Port       int    `json:"port"`
	Username   string `json:"username"`
	Password   string `json:"password"`
	RemoteDir  string `json:"remoteDir"`
	MaxBackups int    `json:"maxBackups"`
}

func (c *ConfigManager) getFTPKey() []byte {
	conf := c.GetFTPConfig()
	if conf == nil {
		return c.key
	}
	hash := sha256.Sum256([]byte(conf.Host + fmt.Sprintf("%d", conf.Port) + conf.Username + conf.Password))
	return hash[:]
}

func (c *ConfigManager) GetFTPConfig() *FTPConfig {
	ftpFile := filepath.Join(c.configDir, "ftp.json")
	data, err := os.ReadFile(ftpFile)
	if err != nil {
		return nil
	}
	var conf FTPConfig
	json.Unmarshal(data, &conf)
	conf.Username = c.decrypt(conf.Username)
	conf.Password = c.decrypt(conf.Password)
	if conf.RemoteDir == "" {
		conf.RemoteDir = "/Aether/"
	}
	if conf.Port == 0 {
		conf.Port = 21
	}
	return &conf
}

func (c *ConfigManager) SaveFTPConfig(config map[string]string) error {
	existing := c.GetFTPConfig()

	username := config["username"]
	password := config["password"]
	if username == "" && existing != nil {
		username = existing.Username
	}
	if password == "" && existing != nil {
		password = existing.Password
	}

	port := 21
	if config["port"] != "" {
		fmt.Sscanf(config["port"], "%d", &port)
	}

	remoteDir := config["remoteDir"]
	if remoteDir == "" {
		remoteDir = "/Aether/"
	}
	if !strings.HasPrefix(remoteDir, "/") {
		remoteDir = "/" + remoteDir
	}
	if !strings.HasSuffix(remoteDir, "/") {
		remoteDir += "/"
	}

	maxBackups := 0
	if config["maxBackups"] != "" {
		fmt.Sscanf(config["maxBackups"], "%d", &maxBackups)
	}

	conf := FTPConfig{
		Host:       config["host"],
		Port:       port,
		Username:   c.encrypt(username),
		Password:   c.encrypt(password),
		RemoteDir:  remoteDir,
		MaxBackups: maxBackups,
	}
	ftpFile := filepath.Join(c.configDir, "ftp.json")
	data, _ := json.MarshalIndent(conf, "", "  ")
	return os.WriteFile(ftpFile, data, 0600)
}

func (c *ConfigManager) TestFTPConnection(host string, port int, username, password string) error {
	client, err := ftp.Dial(fmt.Sprintf("%s:%d", host, port), ftp.DialWithTimeout(10*time.Second))
	if err != nil {
		return err
	}
	defer client.Quit()

	err = client.Login(username, password)
	if err != nil {
		return err
	}
	return nil
}

func (c *ConfigManager) newFTPClient() (*ftp.ServerConn, error) {
	conf := c.GetFTPConfig()
	if conf == nil {
		return nil, fmt.Errorf("FTP not configured")
	}
	client, err := ftp.Dial(fmt.Sprintf("%s:%d", conf.Host, conf.Port), ftp.DialWithTimeout(10*time.Second))
	if err != nil {
		return nil, err
	}
	err = client.Login(conf.Username, conf.Password)
	if err != nil {
		client.Quit()
		return nil, err
	}
	return client, nil
}

func (c *ConfigManager) ensureFTPDir(client *ftp.ServerConn) error {
	conf := c.GetFTPConfig()
	if conf == nil {
		return fmt.Errorf("FTP not configured")
	}

	// Try to change to the remote directory first
	err := client.ChangeDir(conf.RemoteDir)
	if err == nil {
		return nil
	}

	// Directory doesn't exist, create it level by level
	parts := strings.Split(strings.Trim(conf.RemoteDir, "/"), "/")
	current := ""
	for _, part := range parts {
		if part == "" {
			continue
		}
		current += "/" + part
		err := client.ChangeDir(current)
		if err != nil {
			err = client.MakeDir(current)
			if err != nil {
				return fmt.Errorf("failed to create directory %s: %v", current, err)
			}
		}
	}
	// Final change to the target dir
	return client.ChangeDir(conf.RemoteDir)
}

func (c *ConfigManager) BackupToFTP() (map[string]interface{}, error) {
	conf := c.GetFTPConfig()
	if conf == nil {
		return nil, fmt.Errorf("FTP not configured")
	}
	client, err := c.newFTPClient()
	if err != nil {
		return nil, err
	}
	defer client.Quit()

	err = c.ensureFTPDir(client)
	if err != nil {
		return nil, err
	}

	conns := c.GetConnections()
	data, _ := json.MarshalIndent(conns, "", "  ")
	key := c.getFTPKey()
	encryptedData := c.encryptWithKey(string(data), key)

	timestamp := time.Now().Format("20060102_150405")
	fileName := fmt.Sprintf("connections_backup_%s.enc", timestamp)

	err = client.Stor(fileName, bytes.NewReader([]byte(encryptedData)))
	if err != nil {
		return nil, err
	}

	// Prune old backups
	if conf.MaxBackups > 0 {
		entries, err := client.List(conf.RemoteDir)
		if err == nil {
			type backupEntry struct {
				name string
				time time.Time
			}
			var backupFiles []backupEntry
			for _, e := range entries {
				if e.Type == ftp.EntryTypeFile && strings.HasPrefix(e.Name, "connections_backup_") {
					backupFiles = append(backupFiles, backupEntry{e.Name, e.Time})
				}
			}
			if len(backupFiles) > conf.MaxBackups {
				sort.Slice(backupFiles, func(i, j int) bool {
					return backupFiles[i].time.Before(backupFiles[j].time)
				})
				for i := 0; i < len(backupFiles)-conf.MaxBackups; i++ {
					client.Delete(conf.RemoteDir + backupFiles[i].name)
				}
			}
		}
	}

	return map[string]interface{}{
		"path":  strings.TrimRight(conf.RemoteDir, "/") + "/" + fileName,
		"time":  time.Now().Format("2006-01-02 15:04:05"),
		"count": len(conns),
	}, nil
}

func (c *ConfigManager) ListFTPBackups() ([]map[string]interface{}, error) {
	conf := c.GetFTPConfig()
	if conf == nil {
		return nil, fmt.Errorf("FTP not configured")
	}
	client, err := c.newFTPClient()
	if err != nil {
		return nil, err
	}
	defer client.Quit()

	entries, err := client.List(conf.RemoteDir)
	if err != nil {
		return nil, err
	}

	var backups []map[string]interface{}
	for _, entry := range entries {
		if entry.Type == ftp.EntryTypeFile {
			backups = append(backups, map[string]interface{}{
				"name": entry.Name,
				"time": entry.Time.Format("2006-01-02 15:04:05"),
				"size": int64(entry.Size),
			})
		}
	}

	sort.Slice(backups, func(i, j int) bool {
		t1, _ := time.Parse("2006-01-02 15:04:05", backups[i]["time"].(string))
		t2, _ := time.Parse("2006-01-02 15:04:05", backups[j]["time"].(string))
		return t1.After(t2)
	})

	return backups, nil
}

func (c *ConfigManager) RestoreFromFTPFile(filename string) (map[string]interface{}, error) {
	conf := c.GetFTPConfig()
	if conf == nil {
		return nil, fmt.Errorf("FTP not configured")
	}
	client, err := c.newFTPClient()
	if err != nil {
		return nil, err
	}
	defer client.Quit()

	remotePath := strings.TrimRight(conf.RemoteDir, "/") + "/" + filename
	resp, err := client.Retr(remotePath)
	if err != nil {
		return nil, err
	}
	defer resp.Close()

	buf := new(bytes.Buffer)
	_, err = buf.ReadFrom(resp)
	if err != nil {
		return nil, err
	}

	key := c.getFTPKey()
	conns, err := c.decryptAndParse(buf.String(), key)
	if err != nil {
		return nil, err
	}

	c.saveConnectionsFile(conns)
	return map[string]interface{}{
		"success": true,
	}, nil
}

func (c *ConfigManager) SyncFromFTP() (map[string]interface{}, error) {
	return c.syncFromProvider(
		func() ([]Connection, error) {
			conf := c.GetFTPConfig()
			if conf == nil {
				return nil, fmt.Errorf("FTP not configured")
			}
			client, err := c.newFTPClient()
			if err != nil {
				return nil, err
			}
			defer client.Quit()

			entries, err := client.List(conf.RemoteDir)
			if err != nil {
				return nil, fmt.Errorf("读取远程目录失败：%v", err)
			}

			var latestFile string
			var latestTime time.Time
			for _, entry := range entries {
				if entry.Type == ftp.EntryTypeFile && entry.Time.After(latestTime) {
					latestTime = entry.Time
					latestFile = entry.Name
				}
			}
			if latestFile == "" {
				return nil, fmt.Errorf("云端没有备份文件")
			}

			remotePath := strings.TrimRight(conf.RemoteDir, "/") + "/" + latestFile
			resp, err := client.Retr(remotePath)
			if err != nil {
				return nil, err
			}
			defer resp.Close()

			buf := new(bytes.Buffer)
			_, err = buf.ReadFrom(resp)
			if err != nil {
				return nil, err
			}

			key := c.getFTPKey()
			return c.decryptAndParse(buf.String(), key)
		},
		c.BackupToFTP,
	)
}
