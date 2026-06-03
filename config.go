package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/studio-b12/gowebdav"
)

// Connection struct
type Connection struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Host       string `json:"host"`
	Port       int    `json:"port"`
	Username   string `json:"username"`
	Password   string `json:"password,omitempty"`
	AuthMethod string `json:"authMethod"`
	PrivateKey string `json:"privateKey,omitempty"`
	Passphrase string `json:"passphrase,omitempty"`
}

type ConfigManager struct {
	configDir string
	connFile  string
	davFile   string
	key       []byte
}

func NewConfigManager() *ConfigManager {
	appData, _ := os.UserConfigDir()
	dir := filepath.Join(appData, "Aether", "config")

	os.MkdirAll(dir, 0755)

	keyFile := filepath.Join(dir, "aether.key")
	var key []byte
	var keyErr error

	connFile := filepath.Join(dir, "connections.json")
	davFile := filepath.Join(dir, "webdav.json")

	// 检查是否存在本地独立密钥文件
	if _, err := os.Stat(keyFile); err == nil {
		// 密钥已存在，直接读取
		key, keyErr = os.ReadFile(keyFile)
		if keyErr != nil || len(key) != 32 {
			// 如果读取损坏或长度不符，重新生成
			key = make([]byte, 32)
			rand.Read(key)
			os.WriteFile(keyFile, key, 0600)
		}
	} else {
		// 密钥文件不存在，生成全新密钥
		newKey := make([]byte, 32)
		rand.Read(newKey)
		os.WriteFile(keyFile, newKey, 0600)
		key = newKey
	}

	return &ConfigManager{
		configDir: dir,
		connFile:  connFile,
		davFile:   davFile,
		key:       key,
	}
}

func (c *ConfigManager) encrypt(text string) string {
	if text == "" {
		return ""
	}
	block, _ := aes.NewCipher(c.key)
	gcm, _ := cipher.NewGCM(block)
	nonce := make([]byte, gcm.NonceSize())
	io.ReadFull(rand.Reader, nonce)
	ciphertext := gcm.Seal(nonce, nonce, []byte(text), nil)
	return fmt.Sprintf("%x", ciphertext)
}

func (c *ConfigManager) encryptWithKey(text string, key []byte) string {
	if text == "" {
		return ""
	}
	block, _ := aes.NewCipher(key)
	gcm, _ := cipher.NewGCM(block)
	nonce := make([]byte, gcm.NonceSize())
	io.ReadFull(rand.Reader, nonce)
	ciphertext := gcm.Seal(nonce, nonce, []byte(text), nil)
	return fmt.Sprintf("%x", ciphertext)
}

func (c *ConfigManager) decrypt(hexText string) string {
	return c.decryptWithKey(hexText, c.key)
}

func (c *ConfigManager) decryptWithKey(hexText string, key []byte) string {
	if hexText == "" {
		return ""
	}
	var ciphertext []byte
	fmt.Sscanf(hexText, "%x", &ciphertext)

	block, err := aes.NewCipher(key)
	if err != nil {
		return ""
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return ""
	}
	if len(ciphertext) < gcm.NonceSize() {
		return ""
	}
	nonce, ciphertext := ciphertext[:gcm.NonceSize()], ciphertext[gcm.NonceSize():]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return ""
	}
	return string(plaintext)
}

func (c *ConfigManager) GetConnections() []Connection {
	data, err := os.ReadFile(c.connFile)
	if err != nil {
		return []Connection{}
	}
	var conns []Connection
	json.Unmarshal(data, &conns)
	for i := range conns {
		conns[i].Password = c.decrypt(conns[i].Password)
		conns[i].Passphrase = c.decrypt(conns[i].Passphrase)
	}
	return conns
}

func (c *ConfigManager) GetConnectionByID(id string) *Connection {
	conns := c.GetConnections()
	for _, conn := range conns {
		if conn.ID == id {
			return &conn
		}
	}
	return nil
}

func (c *ConfigManager) SaveConnection(conn Connection) Connection {
	conns := c.GetConnections()
	if conn.ID == "" {
		conn.ID = fmt.Sprintf("%d", time.Now().UnixNano())
		conns = append(conns, conn)
	} else {
		found := false
		for i, existing := range conns {
			if existing.ID == conn.ID {
				// If no new password provided, keep old
				if conn.Password == "" && existing.Password != "" {
					conn.Password = existing.Password
				}
				conns[i] = conn
				found = true
				break
			}
		}
		if !found {
			conns = append(conns, conn)
		}
	}

	c.saveConnectionsFile(conns)
	go c.BackupToWebdav()
	return conn
}

func (c *ConfigManager) saveConnectionsFile(conns []Connection) {
	toSave := make([]Connection, len(conns))
	copy(toSave, conns)
	for i := range toSave {
		toSave[i].Password = c.encrypt(toSave[i].Password)
		toSave[i].Passphrase = c.encrypt(toSave[i].Passphrase)
	}
	data, _ := json.MarshalIndent(toSave, "", "  ")
	os.WriteFile(c.connFile, data, 0600)
}

func (c *ConfigManager) DeleteConnection(id string) bool {
	conns := c.GetConnections()
	filtered := []Connection{}
	for _, conn := range conns {
		if conn.ID != id {
			filtered = append(filtered, conn)
		}
	}
	c.saveConnectionsFile(filtered)
	go c.BackupToWebdav()
	return true
}

// WEBDAV
type WebdavConfig struct {
	Url        string `json:"url"`
	Username   string `json:"username"`
	Password   string `json:"password"`
	RemotePath string `json:"remotePath"`
}

func (c *ConfigManager) GetWebdavConfig() map[string]string {
	data, err := os.ReadFile(c.davFile)
	if err != nil {
		return nil
	}
	var conf WebdavConfig
	json.Unmarshal(data, &conf)
	return map[string]string{
		"url":        conf.Url,
		"username":   c.decrypt(conf.Username),
		"password":   c.decrypt(conf.Password),
		"remotePath": conf.RemotePath,
	}
}

func (c *ConfigManager) getWebdavKey() []byte {
	confMap := c.GetWebdavConfig()
	if confMap == nil || confMap["url"] == "" {
		return c.key
	}
	hash := sha256.Sum256([]byte(confMap["url"] + confMap["username"] + confMap["password"]))
	return hash[:]
}

func (c *ConfigManager) SaveWebdavConfig(config map[string]string) error {
	pass := config["password"]
	if pass == "" {
		existing := c.GetWebdavConfig()
		if existing != nil && existing["password"] != "" {
			pass = existing["password"]
		}
	}

	conf := WebdavConfig{
		Url:        config["url"],
		Username:   c.encrypt(config["username"]),
		Password:   c.encrypt(pass),
		RemotePath: config["remotePath"],
	}
	if conf.RemotePath == "" {
		conf.RemotePath = "/Aether/"
	}
	data, _ := json.MarshalIndent(conf, "", "  ")
	return os.WriteFile(c.davFile, data, 0600)
}

func (c *ConfigManager) TestWebdavConnection(url, username, password string) error {
	client := gowebdav.NewClient(url, username, password)
	_, err := client.ReadDir("/")
	return err
}

func (c *ConfigManager) BackupToWebdav() (map[string]interface{}, error) {
	confMap := c.GetWebdavConfig()
	if confMap == nil {
		return nil, fmt.Errorf("WebDAV not configured")
	}
	client := gowebdav.NewClient(confMap["url"], confMap["username"], confMap["password"])

	// Check dir
	remotePath := confMap["remotePath"]
	_, err := client.ReadDir(remotePath)
	if err != nil {
		client.MkdirAll(remotePath, 0755)
	}

	conns := c.GetConnections()
	data, _ := json.MarshalIndent(conns, "", "  ")
	key := c.getWebdavKey()
	encryptedData := c.encryptWithKey(string(data), key)

	timestamp := time.Now().Format("20060102_150405")
	fileName := fmt.Sprintf("connections_backup_%s.enc", timestamp)
	remoteFile := filepath.ToSlash(filepath.Join(remotePath, fileName))
	err = client.Write(remoteFile, []byte(encryptedData), 0644)
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"path":  remoteFile,
		"time":  time.Now().Format("2006-01-02 15:04:05"),
		"count": len(conns),
	}, nil
}

func (c *ConfigManager) ListWebdavBackups() ([]map[string]interface{}, error) {
	confMap := c.GetWebdavConfig()
	if confMap == nil {
		return nil, fmt.Errorf("WebDAV not configured")
	}
	client := gowebdav.NewClient(confMap["url"], confMap["username"], confMap["password"])

	files, err := client.ReadDir(confMap["remotePath"])
	if err != nil {
		return nil, err
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
	return backups, nil
}

func (c *ConfigManager) RestoreFromWebdavFile(filename string) (map[string]interface{}, error) {
	confMap := c.GetWebdavConfig()
	if confMap == nil {
		return nil, fmt.Errorf("WebDAV not configured")
	}
	client := gowebdav.NewClient(confMap["url"], confMap["username"], confMap["password"])
	remoteFile := filepath.ToSlash(filepath.Join(confMap["remotePath"], filename))

	data, err := client.Read(remoteFile)
	if err != nil {
		return nil, err
	}

	key := c.getWebdavKey()
	decrypted := c.decryptWithKey(string(data), key)

	if decrypted == "" {
		// 降级尝试使用本地旧密钥解密（兼容老版本备份）
		decrypted = c.decryptWithKey(string(data), c.key)
		if decrypted == "" {
			return nil, fmt.Errorf("解密失败：如果这是旧版本产生的备份，且您之前卸载清理了本地缓存(aether.key)，则受 AES-256 高强加密保护，资料已永久无法恢复。")
		}
	}

	var conns []Connection
	err = json.Unmarshal([]byte(decrypted), &conns)
	if err != nil {
		return nil, fmt.Errorf("解析备份文件出错：%v", err)
	}

	c.saveConnectionsFile(conns)
	return map[string]interface{}{
		"success": true,
	}, nil
}
