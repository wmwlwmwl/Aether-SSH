package main

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"
)

// ─── 通用接口 ─────────────────────────────────────────────

// RemoteFile 远端文件元信息
type RemoteFile struct {
	Name    string
	ModTime time.Time
	IsDir   bool
	Size    int64
}

// RemoteStorage 远端存储接口，各提供商只需实现这四个方法 + 提供加密密钥
type RemoteStorage interface {
	ListFiles() ([]RemoteFile, error)
	ReadFile(name string) ([]byte, error)
	WriteFile(name string, data []byte) error
	DeleteFile(name string) error
	EncryptKey() []byte
}

// ─── 共享解密/解析 ─────────────────────────────────────────

// decryptAndParse 尝试用 key 解密 data，失败则降级用主密钥解密，并解析为连接列表
func (c *ConfigManager) decryptAndParse(data string, key []byte) ([]Connection, error) {
	decrypted := c.decryptWithKey(data, key)
	if decrypted == "" {
		decrypted = c.decryptWithKey(data, c.key)
		if decrypted == "" {
			return nil, fmt.Errorf("解密失败：如果这是旧版本产生的备份，且您之前卸载清理了本地缓存(aether.key)，则受 AES-256 高强加密保护，资料已永久无法恢复。")
		}
	}
	var conns []Connection
	err := json.Unmarshal([]byte(decrypted), &conns)
	if err != nil {
		return nil, fmt.Errorf("解析备份文件出错：%v", err)
	}
	return conns, nil
}

// ─── 共享合并/比较 ─────────────────────────────────────────

// mergeAndDedupe 合并本地和远程连接列表：
// 1. 按 ID 合并（远端覆盖同名）
// 2. 按 host:port+username 去重，保留信息更完整的记录
func (c *ConfigManager) mergeAndDedupe(localConns, remoteConns []Connection) []Connection {
	mergedMap := make(map[string]Connection)
	for _, lc := range localConns {
		mergedMap[lc.ID] = lc
	}
	for _, rc := range remoteConns {
		mergedMap[rc.ID] = rc
	}

	merged := make([]Connection, 0, len(mergedMap))
	for _, v := range mergedMap {
		merged = append(merged, v)
	}

	type hpKey struct {
		host string
		port int
		user string
	}
	hostPortMap := make(map[hpKey]int)
	var deduped []Connection
	for _, v := range merged {
		key := hpKey{v.Host, v.Port, v.Username}
		if idx, ok := hostPortMap[key]; ok {
			existing := deduped[idx]
			if existing.Password == "" && v.Password != "" {
				deduped[idx] = v
			} else if existing.Password != "" && v.Password == "" {
				// keep existing
			} else if existing.PrivateKey == "" && v.PrivateKey != "" {
				deduped[idx] = v
			} else if v.Name != "" && existing.Name == "" {
				deduped[idx] = v
			}
		} else {
			hostPortMap[key] = len(deduped)
			deduped = append(deduped, v)
		}
	}
	return deduped
}

// connsEqual 比较两个连接列表是否内容一致（按 ID 排序后比 JSON）
func connsEqual(a, b []Connection) bool {
	if len(a) != len(b) {
		return false
	}
	sa := sortedConnsJSON(a)
	sb := sortedConnsJSON(b)
	return sa == sb
}

func sortedConnsJSON(conns []Connection) string {
	sorted := make([]Connection, len(conns))
	copy(sorted, conns)
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].ID < sorted[j].ID
	})
	data, _ := json.Marshal(sorted)
	return string(data)
}

// ─── 共享远端操作 ─────────────────────────────────────────

// fetchLatestBackup 从远端下载最新备份并解密
func (c *ConfigManager) fetchLatestBackup(s RemoteStorage) ([]Connection, error) {
	files, err := s.ListFiles()
	if err != nil {
		return nil, fmt.Errorf("读取远程目录失败：%v", err)
	}

	var latest string
	var latestTime time.Time
	for _, f := range files {
		if !f.IsDir && strings.HasPrefix(f.Name, "connections_backup_") && f.ModTime.After(latestTime) {
			latestTime = f.ModTime
			latest = f.Name
		}
	}
	if latest == "" {
		return nil, fmt.Errorf("云端没有备份文件")
	}

	data, err := s.ReadFile(latest)
	if err != nil {
		return nil, err
	}
	return c.decryptAndParse(string(data), s.EncryptKey())
}

// backupConnections 加密本地连接列表并上传到远端，同时清理超出 maxBackups 的旧备份
func (c *ConfigManager) backupConnections(s RemoteStorage, maxBackups int) (map[string]interface{}, error) {
	conns := c.GetConnections()
	data, _ := json.MarshalIndent(conns, "", "  ")
	encrypted := c.encryptWithKey(string(data), s.EncryptKey())

	timestamp := time.Now().Format("20060102_150405")
	fileName := fmt.Sprintf("connections_backup_%s.enc", timestamp)
	if err := s.WriteFile(fileName, []byte(encrypted)); err != nil {
		return nil, err
	}

	if maxBackups > 0 {
		c.pruneOldBackups(s, maxBackups)
	}

	return map[string]interface{}{
		"path":  fileName,
		"time":  time.Now().Format("2006-01-02 15:04:05"),
		"count": len(conns),
	}, nil
}

// pruneOldBackups 删除超出数量的最旧备份文件
func (c *ConfigManager) pruneOldBackups(s RemoteStorage, maxBackups int) {
	files, err := s.ListFiles()
	if err != nil {
		return
	}

	type backupEntry struct {
		name string
		time time.Time
	}
	var backups []backupEntry
	for _, f := range files {
		if !f.IsDir && strings.HasPrefix(f.Name, "connections_backup_") {
			backups = append(backups, backupEntry{f.Name, f.ModTime})
		}
	}
	if len(backups) > maxBackups {
		sort.Slice(backups, func(i, j int) bool {
			return backups[i].time.Before(backups[j].time)
		})
		for i := 0; i < len(backups)-maxBackups; i++ {
			s.DeleteFile(backups[i].name)
		}
	}
}

// listBackupFiles 列出远端备份文件及其元信息
func (c *ConfigManager) listBackupFiles(s RemoteStorage) ([]map[string]interface{}, error) {
	files, err := s.ListFiles()
	if err != nil {
		return nil, err
	}

	var backups []map[string]interface{}
	for _, f := range files {
		if !f.IsDir && strings.HasPrefix(f.Name, "connections_backup_") {
			backups = append(backups, map[string]interface{}{
				"name": f.Name,
				"size": f.Size,
				"time": f.ModTime.Format("2006-01-02 15:04:05"),
			})
		}
	}

	sort.Slice(backups, func(i, j int) bool {
		return backups[i]["name"].(string) > backups[j]["name"].(string)
	})
	return backups, nil
}

// ─── 同步入口 ─────────────────────────────────────────────

// syncFromProvider 手动合并同步：下载远端 → 合并本地 → 保存 → 条件上传
func (c *ConfigManager) syncFromProvider(s RemoteStorage) (map[string]interface{}, error) {
	remoteConns, err := c.fetchLatestBackup(s)
	if err != nil {
		return nil, err
	}

	localConns := c.GetConnections()
	deduped := c.mergeAndDedupe(localConns, remoteConns)
	c.saveConnectionsFile(deduped)

	var backupResult interface{}
	if !connsEqual(deduped, remoteConns) {
		backupResult, _ = c.backupConnections(s, 0) // 不重复 prune
	}

	return map[string]interface{}{
		"success":     true,
		"localCount":  len(localConns),
		"remoteCount": len(remoteConns),
		"mergedCount": len(deduped),
		"backup":      backupResult,
	}, nil
}

// autoSyncProvider 自动同步：以本地为准，本地删除的从云端移除，无变化则跳过
func (c *ConfigManager) autoSyncProvider(s RemoteStorage, maxBackups int) {
	localConns := c.GetConnections()

	remoteConns, err := c.fetchLatestBackup(s)
	if err != nil {
		c.backupConnections(s, maxBackups) // 云端无备份，直接上传
		return
	}

	if !connsEqual(localConns, remoteConns) {
		c.backupConnections(s, maxBackups)
	}
}

// ─── 同步模式分发 ─────────────────────────────────────────

// getSyncProviders 返回当前同步模式下所有已配置的提供商
func (c *ConfigManager) getSyncProviders() []providerEntry {
	mode := c.GetSyncMode()
	var entries []providerEntry

	add := func(match string, storageFn func() (RemoteStorage, int, error)) {
		if mode == match || mode == "all" {
			s, max, err := storageFn()
			if err == nil {
				entries = append(entries, providerEntry{storage: s, maxBackups: max})
			}
		}
	}

	add("webdav", c.newWebdavStorage)
	add("r2", c.newR2Storage)
	add("ftp", c.newFTPStorage)
	add("sftp", c.newSFTPStorage)

	if mode == "all" || mode == "webdav" {
		// 已在上方处理
	} else {
		// 选中的方式不可用则回退到 webdav
		if len(entries) == 0 {
			s, max, err := c.newWebdavStorage()
			if err == nil {
				entries = append(entries, providerEntry{storage: s, maxBackups: max})
			}
		}
	}

	return entries
}

type providerEntry struct {
	storage    RemoteStorage
	maxBackups int
}

// AutoSync 自动同步：以本地为准推送变更到所有已配置的云端
func (c *ConfigManager) AutoSync() {
	for _, p := range c.getSyncProviders() {
		c.autoSyncProvider(p.storage, p.maxBackups)
	}
}

// AutoSyncToWebdav 保留向后兼容
func (c *ConfigManager) AutoSyncToWebdav() {
	c.AutoSync()
}
