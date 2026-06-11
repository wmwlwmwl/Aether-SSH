package main

import (
	"encoding/json"
	"fmt"
	"sort"
)

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

// syncFromProvider 通用的合并同步逻辑：获取远端连接 → 合并 → 保存 → 条件上传
func (c *ConfigManager) syncFromProvider(
	fetchRemote func() ([]Connection, error),
	backup func() (map[string]interface{}, error),
) (map[string]interface{}, error) {
	remoteConns, err := fetchRemote()
	if err != nil {
		return nil, err
	}

	localConns := c.GetConnections()
	deduped := c.mergeAndDedupe(localConns, remoteConns)

	c.saveConnectionsFile(deduped)
	var backupResult interface{}
	if !connsEqual(deduped, remoteConns) {
		backupResult, _ = backup()
	}

	return map[string]interface{}{
		"success":     true,
		"localCount":  len(localConns),
		"remoteCount": len(remoteConns),
		"mergedCount": len(deduped),
		"backup":      backupResult,
	}, nil
}
