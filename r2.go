package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type R2Config struct {
	AccessKeyID     string `json:"accessKeyId"`
	SecretAccessKey string `json:"secretAccessKey"`
	Bucket          string `json:"bucket"`
	Endpoint        string `json:"endpoint"`
	Region          string `json:"region"`
	Prefix          string `json:"prefix"`
}

func (c *ConfigManager) getR2Key() []byte {
	conf := c.GetR2Config()
	if conf == nil {
		return c.key
	}
	hash := sha256.Sum256([]byte(conf.AccessKeyID + conf.SecretAccessKey + conf.Bucket + conf.Endpoint))
	return hash[:]
}

func (c *ConfigManager) GetR2Config() *R2Config {
	r2File := filepath.Join(c.configDir, "r2.json")
	data, err := os.ReadFile(r2File)
	if err != nil {
		return nil
	}
	var conf R2Config
	json.Unmarshal(data, &conf)
	conf.AccessKeyID = c.decrypt(conf.AccessKeyID)
	conf.SecretAccessKey = c.decrypt(conf.SecretAccessKey)
	if conf.Region == "" {
		conf.Region = "auto"
	}
	if conf.Prefix == "" {
		conf.Prefix = "Aether/"
	}
	return &conf
}

func (c *ConfigManager) SaveR2Config(config map[string]string) error {
	existing := c.GetR2Config()

	accessKey := config["accessKeyId"]
	secretKey := config["secretAccessKey"]
	if accessKey == "" && existing != nil {
		accessKey = existing.AccessKeyID
	}
	if secretKey == "" && existing != nil {
		secretKey = existing.SecretAccessKey
	}

	prefix := config["prefix"]
	if prefix == "" {
		prefix = "Aether/"
	}
	if prefix[len(prefix)-1] != '/' {
		prefix += "/"
	}

	region := config["region"]
	if region == "" {
		region = "auto"
	}

	conf := R2Config{
		AccessKeyID:     c.encrypt(accessKey),
		SecretAccessKey: c.encrypt(secretKey),
		Bucket:          config["bucket"],
		Endpoint:        sanitizeEndpoint(config["endpoint"]),
		Region:          region,
		Prefix:          prefix,
	}
	r2File := filepath.Join(c.configDir, "r2.json")
	data, _ := json.MarshalIndent(conf, "", "  ")
	return os.WriteFile(r2File, data, 0600)
}

// sanitizeEndpoint 去除 URL 中的协议前缀和尾部斜杠，minio.New 会自动拼接 https://
func sanitizeEndpoint(endpoint string) string {
	e := strings.TrimSpace(endpoint)
	e = strings.TrimSuffix(e, "/")
	e = strings.TrimPrefix(e, "https://")
	e = strings.TrimPrefix(e, "http://")
	return e
}

func (c *ConfigManager) TestR2Connection(accessKeyId, secretAccessKey, bucket, endpoint string) error {
	cli, err := minio.New(sanitizeEndpoint(endpoint), &minio.Options{
		Creds:  credentials.NewStaticV4(accessKeyId, secretAccessKey, ""),
		Secure: true,
		Region: "auto",
	})
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	for obj := range cli.ListObjects(ctx, bucket, minio.ListObjectsOptions{
		Prefix:  "",
		MaxKeys: 1,
	}) {
		if obj.Err != nil {
			return obj.Err
		}
		break
	}
	return nil
}

func (c *ConfigManager) newR2Client() (*minio.Client, error) {
	conf := c.GetR2Config()
	if conf == nil {
		return nil, fmt.Errorf("R2 not configured")
	}
	return minio.New(sanitizeEndpoint(conf.Endpoint), &minio.Options{
		Creds:  credentials.NewStaticV4(conf.AccessKeyID, conf.SecretAccessKey, ""),
		Secure: true,
		Region: conf.Region,
	})
}

func (c *ConfigManager) BackupToR2() (map[string]interface{}, error) {
	conf := c.GetR2Config()
	if conf == nil {
		return nil, fmt.Errorf("R2 not configured")
	}
	cli, err := c.newR2Client()
	if err != nil {
		return nil, err
	}

	conns := c.GetConnections()
	data, _ := json.MarshalIndent(conns, "", "  ")
	key := c.getR2Key()
	encryptedData := c.encryptWithKey(string(data), key)

	timestamp := time.Now().Format("20060102_150405")
	fileName := fmt.Sprintf("connections_backup_%s.enc", timestamp)
	objectKey := conf.Prefix + fileName

	ctx := context.Background()
	_, err = cli.PutObject(ctx, conf.Bucket, objectKey, bytes.NewReader([]byte(encryptedData)), int64(len(encryptedData)), minio.PutObjectOptions{
		ContentType: "application/octet-stream",
	})
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"path":  objectKey,
		"time":  time.Now().Format("2006-01-02 15:04:05"),
		"count": len(conns),
	}, nil
}

func (c *ConfigManager) ListR2Backups() ([]map[string]interface{}, error) {
	conf := c.GetR2Config()
	if conf == nil {
		return nil, fmt.Errorf("R2 not configured")
	}
	cli, err := c.newR2Client()
	if err != nil {
		return nil, err
	}

	ctx := context.Background()
	objects := cli.ListObjects(ctx, conf.Bucket, minio.ListObjectsOptions{
		Prefix: conf.Prefix,
	})

	var backups []map[string]interface{}
	for obj := range objects {
		if obj.Err != nil {
			continue
		}
		backups = append(backups, map[string]interface{}{
			"name": obj.Key,
			"time": obj.LastModified.Format("2006-01-02 15:04:05"),
			"size": obj.Size,
		})
	}

	sort.Slice(backups, func(i, j int) bool {
		t1, _ := time.Parse("2006-01-02 15:04:05", backups[i]["time"].(string))
		t2, _ := time.Parse("2006-01-02 15:04:05", backups[j]["time"].(string))
		return t1.After(t2)
	})

	return backups, nil
}

func (c *ConfigManager) RestoreFromR2File(objectKey string) (map[string]interface{}, error) {
	conf := c.GetR2Config()
	if conf == nil {
		return nil, fmt.Errorf("R2 not configured")
	}
	cli, err := c.newR2Client()
	if err != nil {
		return nil, err
	}

	ctx := context.Background()
	obj, err := cli.GetObject(ctx, conf.Bucket, objectKey, minio.GetObjectOptions{})
	if err != nil {
		return nil, err
	}
	defer obj.Close()

	buf := new(bytes.Buffer)
	_, err = buf.ReadFrom(obj)
	if err != nil {
		return nil, err
	}

	key := c.getR2Key()
	conns, err := c.decryptAndParse(buf.String(), key)
	if err != nil {
		return nil, err
	}

	c.saveConnectionsFile(conns)
	return map[string]interface{}{
		"success": true,
	}, nil
}

func (c *ConfigManager) SyncFromR2() (map[string]interface{}, error) {
	conf := c.GetR2Config()
	if conf == nil {
		return nil, fmt.Errorf("R2 not configured")
	}
	cli, err := c.newR2Client()
	if err != nil {
		return nil, err
	}

	ctx := context.Background()
	objects := cli.ListObjects(ctx, conf.Bucket, minio.ListObjectsOptions{
		Prefix: conf.Prefix,
	})

	var latestObj string
	var latestTime time.Time
	for obj := range objects {
		if obj.Err != nil {
			continue
		}
		if obj.LastModified.After(latestTime) {
			latestTime = obj.LastModified
			latestObj = obj.Key
		}
	}
	if latestObj == "" {
		return nil, fmt.Errorf("云端没有备份文件")
	}

	// 下载
	obj, err := cli.GetObject(ctx, conf.Bucket, latestObj, minio.GetObjectOptions{})
	if err != nil {
		return nil, err
	}
	defer obj.Close()

	buf := new(bytes.Buffer)
	_, err = buf.ReadFrom(obj)
	if err != nil {
		return nil, err
	}

	key := c.getR2Key()
	remoteConns, err := c.decryptAndParse(buf.String(), key)
	if err != nil {
		return nil, err
	}

	localConns := c.GetConnections()
	deduped := c.mergeAndDedupe(localConns, remoteConns)

	c.saveConnectionsFile(deduped)
	backupResult, _ := c.BackupToR2()

	return map[string]interface{}{
		"success":     true,
		"localCount":  len(localConns),
		"remoteCount": len(remoteConns),
		"mergedCount": len(deduped),
		"backup":      backupResult,
	}, nil
}

func (c *ConfigManager) AutoSyncToR2() {
	_, err := c.SyncFromR2()
	if err != nil {
		_, _ = c.BackupToR2()
	}
}
