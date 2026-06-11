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

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
)

type SFTPConfig struct {
	Host       string `json:"host"`
	Port       int    `json:"port"`
	Username   string `json:"username"`
	AuthMethod string `json:"authMethod"` // "password" 或 "key"
	Password   string `json:"password"`
	PrivateKey string `json:"privateKey"`
	RemoteDir  string `json:"remoteDir"`
	MaxBackups int    `json:"maxBackups"`
}

func (c *ConfigManager) getSFTPKey() []byte {
	conf := c.GetSFTPConfig()
	if conf == nil {
		return c.key
	}
	hash := sha256.Sum256([]byte(conf.Host + fmt.Sprintf("%d", conf.Port) + conf.Username + conf.Password + conf.PrivateKey))
	return hash[:]
}

func (c *ConfigManager) GetSFTPConfig() *SFTPConfig {
	sftpFile := filepath.Join(c.configDir, "sftp.json")
	data, err := os.ReadFile(sftpFile)
	if err != nil {
		return nil
	}
	var conf SFTPConfig
	json.Unmarshal(data, &conf)
	conf.Password = c.decrypt(conf.Password)
	conf.PrivateKey = c.decrypt(conf.PrivateKey)
	if conf.Port == 0 {
		conf.Port = 22
	}
	if conf.RemoteDir == "" {
		conf.RemoteDir = "/Aether/"
	}
	if conf.RemoteDir[len(conf.RemoteDir)-1] != '/' {
		conf.RemoteDir += "/"
	}
	return &conf
}

func (c *ConfigManager) SaveSFTPConfig(config map[string]string) error {
	existing := c.GetSFTPConfig()

	password := config["password"]
	privateKey := config["privateKey"]
	if password == "" && existing != nil {
		password = existing.Password
	}
	if privateKey == "" && existing != nil {
		privateKey = existing.PrivateKey
	}

	port := 22
	if p, ok := config["port"]; ok && p != "" {
		fmt.Sscanf(p, "%d", &port)
	}

	remoteDir := config["remoteDir"]
	if remoteDir == "" {
		remoteDir = "/Aether/"
	}
	if remoteDir[len(remoteDir)-1] != '/' {
		remoteDir += "/"
	}

	maxBackups := 0
	if config["maxBackups"] != "" {
		fmt.Sscanf(config["maxBackups"], "%d", &maxBackups)
	}

	conf := SFTPConfig{
		Host:       config["host"],
		Port:       port,
		Username:   config["username"],
		AuthMethod: config["authMethod"],
		Password:   c.encrypt(password),
		PrivateKey: c.encrypt(privateKey),
		RemoteDir:  remoteDir,
		MaxBackups: maxBackups,
	}
	sftpFile := filepath.Join(c.configDir, "sftp.json")
	data, _ := json.MarshalIndent(conf, "", "  ")
	return os.WriteFile(sftpFile, data, 0600)
}

func (c *ConfigManager) TestSFTPConnection(host string, port int, username, password, authMethod, privateKey string) error {
	sshConfig := &ssh.ClientConfig{
		User:            username,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         10 * time.Second,
	}

	if authMethod == "key" {
		signer, err := ssh.ParsePrivateKey([]byte(privateKey))
		if err != nil {
			return fmt.Errorf("解析私钥失败：%v", err)
		}
		sshConfig.Auth = []ssh.AuthMethod{ssh.PublicKeys(signer)}
	} else {
		sshConfig.Auth = []ssh.AuthMethod{ssh.Password(password)}
	}

	sshClient, err := ssh.Dial("tcp", fmt.Sprintf("%s:%d", host, port), sshConfig)
	if err != nil {
		return fmt.Errorf("SSH 连接失败：%v", err)
	}
	defer sshClient.Close()

	sftpClient, err := sftp.NewClient(sshClient)
	if err != nil {
		return fmt.Errorf("SFTP 初始化失败：%v", err)
	}
	defer sftpClient.Close()

	_, err = sftpClient.ReadDir("/")
	if err != nil {
		return fmt.Errorf("读取根目录失败：%v", err)
	}

	return nil
}

func (c *ConfigManager) newSFTPClient() (*sftp.Client, error) {
	conf := c.GetSFTPConfig()
	if conf == nil {
		return nil, fmt.Errorf("SFTP not configured")
	}

	sshConfig := &ssh.ClientConfig{
		User:            conf.Username,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         10 * time.Second,
	}

	if conf.AuthMethod == "key" {
		signer, err := ssh.ParsePrivateKey([]byte(conf.PrivateKey))
		if err != nil {
			return nil, fmt.Errorf("解析私钥失败：%v", err)
		}
		sshConfig.Auth = []ssh.AuthMethod{ssh.PublicKeys(signer)}
	} else {
		sshConfig.Auth = []ssh.AuthMethod{ssh.Password(conf.Password)}
	}

	sshClient, err := ssh.Dial("tcp", fmt.Sprintf("%s:%d", conf.Host, conf.Port), sshConfig)
	if err != nil {
		return nil, fmt.Errorf("SSH 连接失败：%v", err)
	}

	sftpClient, err := sftp.NewClient(sshClient)
	if err != nil {
		sshClient.Close()
		return nil, fmt.Errorf("SFTP 初始化失败：%v", err)
	}

	return sftpClient, nil
}

func (c *ConfigManager) ensureSFTPDir(client *sftp.Client) error {
	conf := c.GetSFTPConfig()
	if conf == nil {
		return fmt.Errorf("SFTP not configured")
	}
	_, err := client.Stat(conf.RemoteDir)
	if err != nil {
		err = client.MkdirAll(conf.RemoteDir)
		if err != nil {
			return fmt.Errorf("创建远程目录失败：%v", err)
		}
	}
	return nil
}

func (c *ConfigManager) BackupToSFTP() (map[string]interface{}, error) {
	conf := c.GetSFTPConfig()
	if conf == nil {
		return nil, fmt.Errorf("SFTP not configured")
	}

	client, err := c.newSFTPClient()
	if err != nil {
		return nil, err
	}
	defer client.Close()

	err = c.ensureSFTPDir(client)
	if err != nil {
		return nil, err
	}

	conns := c.GetConnections()
	data, _ := json.MarshalIndent(conns, "", "  ")
	key := c.getSFTPKey()
	encryptedData := c.encryptWithKey(string(data), key)

	timestamp := time.Now().Format("20060102_150405")
	fileName := fmt.Sprintf("connections_backup_%s.enc", timestamp)
	remotePath := strings.TrimSuffix(conf.RemoteDir, "/") + "/" + fileName

	f, err := client.Create(remotePath)
	if err != nil {
		return nil, fmt.Errorf("创建远程文件失败：%v", err)
	}
	defer f.Close()

	_, err = f.Write([]byte(encryptedData))
	if err != nil {
		return nil, fmt.Errorf("写入远程文件失败：%v", err)
	}
	f.Close()

	// Prune old backups
	if conf.MaxBackups > 0 {
		files, err := client.ReadDir(conf.RemoteDir)
		if err == nil {
			type backupEntry struct {
				name string
				time time.Time
			}
			var backupFiles []backupEntry
			for _, fi := range files {
				if !fi.IsDir() && strings.HasPrefix(fi.Name(), "connections_backup_") {
					backupFiles = append(backupFiles, backupEntry{fi.Name(), fi.ModTime()})
				}
			}
			if len(backupFiles) > conf.MaxBackups {
				sort.Slice(backupFiles, func(i, j int) bool {
					return backupFiles[i].time.Before(backupFiles[j].time)
				})
				for i := 0; i < len(backupFiles)-conf.MaxBackups; i++ {
					client.Remove(strings.TrimSuffix(conf.RemoteDir, "/") + "/" + backupFiles[i].name)
				}
			}
		}
	}

	return map[string]interface{}{
		"path":  remotePath,
		"time":  time.Now().Format("2006-01-02 15:04:05"),
		"count": len(conns),
	}, nil
}

func (c *ConfigManager) ListSFTPBackups() ([]map[string]interface{}, error) {
	conf := c.GetSFTPConfig()
	if conf == nil {
		return nil, fmt.Errorf("SFTP not configured")
	}

	client, err := c.newSFTPClient()
	if err != nil {
		return nil, err
	}
	defer client.Close()

	files, err := client.ReadDir(conf.RemoteDir)
	if err != nil {
		return nil, fmt.Errorf("读取远程目录失败：%v", err)
	}

	var backups []map[string]interface{}
	for _, f := range files {
		if !f.IsDir() {
			backups = append(backups, map[string]interface{}{
				"name": f.Name(),
				"time": f.ModTime().Format("2006-01-02 15:04:05"),
				"size": f.Size(),
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

func (c *ConfigManager) RestoreFromSFTPFile(filename string) (map[string]interface{}, error) {
	conf := c.GetSFTPConfig()
	if conf == nil {
		return nil, fmt.Errorf("SFTP not configured")
	}

	client, err := c.newSFTPClient()
	if err != nil {
		return nil, err
	}
	defer client.Close()

	remotePath := strings.TrimSuffix(conf.RemoteDir, "/") + "/" + filename
	f, err := client.Open(remotePath)
	if err != nil {
		return nil, fmt.Errorf("打开远程文件失败：%v", err)
	}
	defer f.Close()

	buf := new(bytes.Buffer)
	_, err = buf.ReadFrom(f)
	if err != nil {
		return nil, fmt.Errorf("读取远程文件失败：%v", err)
	}

	key := c.getSFTPKey()
	conns, err := c.decryptAndParse(buf.String(), key)
	if err != nil {
		return nil, err
	}

	c.saveConnectionsFile(conns)
	return map[string]interface{}{
		"success": true,
	}, nil
}

func (c *ConfigManager) SyncFromSFTP() (map[string]interface{}, error) {
	return c.syncFromProvider(
		func() ([]Connection, error) {
			conf := c.GetSFTPConfig()
			if conf == nil {
				return nil, fmt.Errorf("SFTP not configured")
			}

			client, err := c.newSFTPClient()
			if err != nil {
				return nil, err
			}
			defer client.Close()

			files, err := client.ReadDir(conf.RemoteDir)
			if err != nil {
				return nil, fmt.Errorf("读取远程目录失败：%v", err)
			}

			var latestFile string
			var latestTime time.Time
			for _, f := range files {
				if !f.IsDir() && f.ModTime().After(latestTime) {
					latestTime = f.ModTime()
					latestFile = f.Name()
				}
			}
			if latestFile == "" {
				return nil, fmt.Errorf("云端没有备份文件")
			}

			remotePath := strings.TrimSuffix(conf.RemoteDir, "/") + "/" + latestFile
			rf, err := client.Open(remotePath)
			if err != nil {
				return nil, err
			}
			defer rf.Close()

			buf := new(bytes.Buffer)
			_, err = buf.ReadFrom(rf)
			if err != nil {
				return nil, err
			}

			key := c.getSFTPKey()
			return c.decryptAndParse(buf.String(), key)
		},
		c.BackupToSFTP,
	)
}
