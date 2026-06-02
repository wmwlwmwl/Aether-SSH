package main

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx           context.Context
	sshManager    *SSHManager
	configManager *ConfigManager
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{
		sshManager:    NewSSHManager(),
		configManager: NewConfigManager(),
	}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.sshManager.ctx = ctx // Give SSH manager access to Wails events

	// Clean up old executable from a previous auto-update
	exePath, err := os.Executable()
	if err == nil {
		dir := filepath.Dir(exePath)
		files, err := os.ReadDir(dir)
		if err == nil {
			for _, file := range files {
				if !file.IsDir() && strings.HasSuffix(file.Name(), ".old") {
					os.Remove(filepath.Join(dir, file.Name()))
				}
			}
		}
	}
}

// IsPortableVersion checks if the current executable is the portable version
func (a *App) IsPortableVersion() bool {
	exePath, err := os.Executable()
	if err != nil {
		return false
	}
	exeName := strings.ToLower(filepath.Base(exePath))
	return strings.Contains(exeName, "portable")
}

// GetConnections returns all saved SSH connections
func (a *App) GetConnections() []Connection {
	return a.configManager.GetConnections()
}

// SaveConnection saves a new or existing connection
func (a *App) SaveConnection(conn Connection) Connection {
	return a.configManager.SaveConnection(conn)
}

// DeleteConnection removes a connection by ID
func (a *App) DeleteConnection(id string) bool {
	return a.configManager.DeleteConnection(id)
}

// ConnectSSH establishes an SSH connection
func (a *App) ConnectSSH(sessionId string, connId string) error {
	conn := a.configManager.GetConnectionByID(connId)
	if conn == nil {
		return fmt.Errorf("connection not found")
	}
	return a.sshManager.Connect(sessionId, *conn)
}

// DisconnectSSH closes an SSH connection
func (a *App) DisconnectSSH(sessionId string) {
	a.sshManager.Disconnect(sessionId)
}

// WriteTerminal sends input to the SSH PTY
func (a *App) WriteTerminal(sessionId string, data string) {
	a.sshManager.Write(sessionId, data)
}

// ResizeTerminal resizes the SSH PTY
func (a *App) ResizeTerminal(sessionId string, cols, rows int) {
	a.sshManager.Resize(sessionId, cols, rows)
}

// SystemInfo retrieves basic system probe info
func (a *App) SystemInfo(sessionId string) (map[string]interface{}, error) {
	return a.sshManager.GetSystemInfo(sessionId)
}

// ListDir lists directory contents via SFTP
func (a *App) ListDir(sessionId string, path string) ([]map[string]interface{}, error) {
	return a.sshManager.ListDir(sessionId, path)
}

// ReadFile reads a file's content via SFTP
func (a *App) ReadFile(sessionId string, path string) (string, error) {
	return a.sshManager.ReadFile(sessionId, path)
}

// WriteFile writes content to a file via SFTP
func (a *App) WriteFile(sessionId string, path string, content string) error {
	return a.sshManager.WriteFile(sessionId, path, content)
}

// DeleteItem deletes a file or directory via SFTP
func (a *App) DeleteItem(sessionId string, path string, isDir bool) error {
	return a.sshManager.DeleteItem(sessionId, path, isDir)
}

// Mkdir creates a directory via SFTP
func (a *App) Mkdir(sessionId string, path string) error {
	return a.sshManager.Mkdir(sessionId, path)
}

// RenameItem renames a file or directory via SFTP
func (a *App) RenameItem(sessionId string, oldPath string, newPath string) error {
	return a.sshManager.RenameItem(sessionId, oldPath, newPath)
}

// CompressItem archives a file or directory on the remote server
func (a *App) CompressItem(sessionId string, remotePath string) error {
	return a.sshManager.CompressItem(sessionId, remotePath)
}

// UncompressItem extracts an archive on the remote server
func (a *App) UncompressItem(sessionId string, remotePath string) error {
	return a.sshManager.UncompressItem(sessionId, remotePath)
}

// TODO: File upload/download using standard file dialogs in Wails
func (a *App) UploadFile(sessionId string, remotePath string) error {
	filepaths, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select File to Upload",
	})
	if err != nil || filepaths == "" {
		return err
	}
	return a.sshManager.UploadFile(sessionId, filepaths, remotePath)
}

func (a *App) DownloadFile(sessionId string, remotePath string) error {
	filename := filepath.Base(remotePath)
	destPath, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Save File",
		DefaultFilename: filename,
	})
	if err != nil || destPath == "" {
		return err
	}
	return a.sshManager.DownloadFile(sessionId, remotePath, destPath)
}

// ReadPrivateKeyFile opens a file dialog to read a private key file
func (a *App) ReadPrivateKeyFile() (string, error) {
	filepath, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "选择私钥文件",
	})
	if err != nil || filepath == "" {
		return "", err
	}
	content, err := os.ReadFile(filepath)
	if err != nil {
		return "", err
	}
	return string(content), nil
}

// WebDAV Methods
func (a *App) GetWebdavConfig() map[string]string {
	return a.configManager.GetWebdavConfig()
}

func (a *App) SaveWebdavConfig(config map[string]string) error {
	return a.configManager.SaveWebdavConfig(config)
}

func (a *App) TestWebdavConnection(url, username, password string) error {
	return a.configManager.TestWebdavConnection(url, username, password)
}

func (a *App) BackupToWebdav() (map[string]interface{}, error) {
	return a.configManager.BackupToWebdav()
}

func (a *App) ListWebdavBackups() ([]map[string]interface{}, error) {
	return a.configManager.ListWebdavBackups()
}

func (a *App) RestoreFromWebdavFile(filename string) (map[string]interface{}, error) {
	return a.configManager.RestoreFromWebdavFile(filename)
}

// PingServer pings a server
func (a *App) PingServer(host string, port int) map[string]interface{} {
	return PingServer(host, port)
}

// downloadProgressReader wraps an io.Reader to track download progress and emit Wails events
type downloadProgressReader struct {
	io.Reader
	ctx         context.Context
	total       int64
	downloaded  int64
	lastEmit    time.Time
}

func (pr *downloadProgressReader) Read(p []byte) (int, error) {
	n, err := pr.Reader.Read(p)
	pr.downloaded += int64(n)

	if pr.total > 0 {
		now := time.Now()
		if now.Sub(pr.lastEmit) >= 200*time.Millisecond || pr.downloaded == pr.total {
			progress := int(float64(pr.downloaded) / float64(pr.total) * 100)
			runtime.EventsEmit(pr.ctx, "app-update-progress", progress)
			pr.lastEmit = now
		}
	}
	return n, err
}

// UpdateApp downloads the new exe from the given url, replaces the current running exe, and restarts the app.
func (a *App) UpdateApp(downloadUrl string, filename string) error {
	// 1. 发起请求下载新文件
	resp, err := http.Get(downloadUrl)
	if err != nil {
		return fmt.Errorf("failed to download update: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("bad status: %s", resp.Status)
	}

	isSetup := strings.Contains(strings.ToLower(filename), "installer") || strings.Contains(strings.ToLower(filename), "setup")
	var targetPath string
	var exePath string

	if isSetup {
		targetPath = filepath.Join(os.TempDir(), filename)
	} else {
		exe, err := os.Executable()
		if err != nil {
			return fmt.Errorf("could not determine executable path: %w", err)
		}
		exePath = exe
		targetPath = exePath + ".update"
	}

	out, err := os.Create(targetPath)
	if err != nil {
		return fmt.Errorf("could not create temporary update file: %w", err)
	}

	progressReader := &downloadProgressReader{
		Reader: resp.Body,
		ctx:    a.ctx,
		total:  resp.ContentLength,
	}

	// 2. 写入到带有进度的缓冲并存入 .update 临时文件
	_, err = io.Copy(out, progressReader)
	out.Close() // Ensure the file is completely flushed and closed
	if err != nil {
		os.Remove(targetPath) // Cleanup on failure
		return fmt.Errorf("failed to save update file: %w", err)
	}

	// 3. 区分 Setup 还是 Portable 替换
	if isSetup {
		// 启动 Setup 安装向导，隐藏黑框
		cmd := exec.Command("cmd.exe", "/C", "start", "", targetPath)
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
		if err := cmd.Start(); err != nil {
			return fmt.Errorf("failed to start setup: %w", err)
		}
		// 退出当前应用以解除目录锁定
		os.Exit(0)
		return nil
	}

	// Portable 热更替换逻辑
	oldPath := exePath + ".old"
	if err := os.Rename(exePath, oldPath); err != nil {
		os.Remove(targetPath)
		return fmt.Errorf("failed to rename current executable: %w", err)
	}

	if err := os.Rename(targetPath, exePath); err != nil {
		os.Rename(oldPath, exePath)
		return fmt.Errorf("failed to apply update file: %w", err)
	}

	cmd := exec.Command(exePath)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to restart application: %w", err)
	}

	os.Exit(0)
	return nil
}
