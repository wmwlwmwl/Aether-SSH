import { useState, useEffect, useCallback, useRef } from 'react';
import * as AppGo from '../../wailsjs/go/main/App.js';
import FileEditor from './FileEditor.jsx';
import { useTranslation } from '../i18n.js';

// 格式化文件大小
function fmtSize(bytes) {
  if (!bytes || bytes === 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

// 格式化日期
function fmtDate(ts) {
  if (!ts) return '-';
  return new Date(ts).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

// 文件图标
function fileIcon(name, isDir) {
  if (isDir) return '📁';
  const ext = (name.split('.').pop() || '').toLowerCase();
  const map = {
    js: '🟨', jsx: '🟨', ts: '🔷', tsx: '🔷', vue: '💚',
    py: '🐍', rb: '💎', go: '🐹', rs: '🦀', java: '☕',
    c: '🔵', cpp: '🔵', h: '🔵', cs: '🟣',
    html: '🌐', css: '🎨', scss: '🎨', less: '🎨',
    json: '⚙️', yaml: '⚙️', yml: '⚙️', toml: '⚙️', ini: '⚙️', env: '⚙️',
    md: '📝', txt: '📄', log: '📋',
    png: '🖼', jpg: '🖼', jpeg: '🖼', gif: '🖼', svg: '🖼', webp: '🖼',
    zip: '🗜', tar: '🗜', gz: '🗜', rar: '🗜', '7z': '🗜',
    sh: '🔧', bash: '🔧', zsh: '🔧',
    pdf: '📕', sql: '🗃', xml: '📰', php: '🐘',
    mp4: '🎬', mkv: '🎬', avi: '🎬',
    mp3: '🎵', wav: '🎵',
  };
  return map[ext] || '📄';
}

// 判断是否可以编辑（文本文件）
function isEditable(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const editable = [
    'txt', 'md', 'log', 'json', 'yaml', 'yml', 'toml', 'ini', 'env', 'conf', 'config',
    'js', 'jsx', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'cs',
    'php', 'html', 'css', 'scss', 'less', 'xml', 'sql', 'sh', 'bash', 'zsh', 'vue', 'svelte',
    'nginx', 'gitignore', 'dockerfile', 'makefile',
  ];
  if (editable.includes(ext)) return true;
  // No extension (like Dockerfile, Makefile)
  if (!name.includes('.')) return true;
  return false;
}

// 判断是否为压缩包
function isArchive(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  return ['zip', 'tar', 'gz', 'bz2', 'tgz', 'rar', '7z'].includes(ext) || name.toLowerCase().endsWith('.tar.gz');
}

// Context menu component
function ContextMenu({ pos, item, onClose, onDownload, onEdit, onRename, onDelete, onMkdir, onNewFile, onCompress, onUncompress, t }) {
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ left: Math.min(pos.x, window.innerWidth - 180), top: Math.min(pos.y, window.innerHeight - 200) }}
    >
      {item && !item.isDirectory && isEditable(item.name) && (
        <div className="context-menu-item" onClick={onEdit}>
          <span>✏️</span> {t('编辑')}
        </div>
      )}
      {item && !item.isDirectory && (
        <div className="context-menu-item" onClick={onDownload}>
          <span>⬇️</span> {t('下载到本地')}
        </div>
      )}
      {item && (
        <div className="context-menu-item" onClick={onCompress}>
          <span>📦</span> {t('压缩 (tar.gz)')}
        </div>
      )}
      {item && !item.isDirectory && isArchive(item.name) && (
        <div className="context-menu-item" onClick={onUncompress}>
          <span>🗜</span> {t('解压')}
        </div>
      )}
      {item && (
        <div className="context-menu-item" onClick={onRename}>
          <span>✏</span> {t('重命名')}
        </div>
      )}
      <div className="context-menu-divider" />
      {!item && (
        <div className="context-menu-item" onClick={onNewFile}>
          <span>📄</span> {t('新建文件')}
        </div>
      )}
      {!item && (
        <div className="context-menu-item" onClick={onMkdir}>
          <span>📁</span> {t('新建文件夹')}
        </div>
      )}
      {item && (
        <div className="context-menu-item danger" onClick={onDelete}>
          <span>🗑</span> {t('删除')}
        </div>
      )}
    </div>
  );
}

export default function FileManager({ sessionId, addToast }) {
  const { t } = useTranslation();
  const [currentPath, setCurrentPath] = useState('/');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState(null); // { pos, item }
  const [renamingItem, setRenamingItem] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [editFile, setEditFile] = useState(null);      // { path, name, content }
  const [transferInfo, setTransferInfo] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  const loadDir = useCallback(async (path) => {
    setLoading(true);
    try {
      const data = await AppGo.ListDir(sessionId, path);
      // Wails 传回的数据： name, isDirectory, size, modifyTime, rights
      setItems(data || []);
      setCurrentPath(path);
    } catch (err) {
      addToast(`读取目录失败: ${err}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [sessionId, addToast]);

  // ── 初始化自动同步最新终端目录 ───────────────────────────
  useEffect(() => {
    const initPath = async () => {
      try {
        const cwd = await AppGo.GetTerminalCwd(sessionId);
        if (cwd) {
          loadDir(cwd);
          return;
        }
      } catch (_) {}
      loadDir('/');
    };
    initPath();
  }, [sessionId, loadDir]);

  // ── 监听终端内的目录切换事件 ─────────────────────────────
  useEffect(() => {
    // 向全局标志位注册订阅，告知 Terminal 组件"文件管理器已挂载，需要 CWD 探测"
    if (!window.__cwdListeners) window.__cwdListeners = {};
    window.__cwdListeners[sessionId] = true;

    const handleTerminalCwd = (e) => {
      if (e.detail && e.detail.sessionId === sessionId) {
        const newPath = e.detail.cwd;
        if (newPath && newPath !== currentPath) {
          loadDir(newPath);
        }
      }
    };
    window.addEventListener('ssh-terminal-cwd-changed', handleTerminalCwd);
    return () => {
      // 注销订阅，文件管理器不可见时不再触发 CWD 探测
      if (window.__cwdListeners) delete window.__cwdListeners[sessionId];
      window.removeEventListener('ssh-terminal-cwd-changed', handleTerminalCwd);
    };
  }, [sessionId, currentPath, loadDir]);

  useEffect(() => {
    const handleProgress = (e) => {
      setTransferInfo(prev => {
        if (!prev) return prev;
        return { ...prev, progress: e.detail };
      });
    };
    const eventName = `transfer-progress-${sessionId}`;
    window.addEventListener(eventName, handleProgress);
    return () => window.removeEventListener(eventName, handleProgress);
  }, [sessionId]);

  // Breadcrumb parts
  const pathParts = currentPath === '/'
    ? [{ label: '目录根', path: '/' }]
    : currentPath.split('/').filter(Boolean).reduce((acc, part, i, arr) => {
        const path = '/' + arr.slice(0, i + 1).join('/');
        acc.push({ label: part, path });
        return acc;
      }, [{ label: '目录根', path: '/' }]);

  // Navigate into folder
  const navigate = (item) => {
    if (!item.isDirectory) return;
    const newPath = currentPath === '/'
      ? `/${item.name}`
      : `${currentPath}/${item.name}`;
    loadDir(newPath);
  };

  // Upload file via Wails native file dialog
  const handleUpload = async () => {
    try {
      setTransferInfo({ name: '正在选择文件...', progress: 0, direction: 'upload' });
      await AppGo.UploadFile(sessionId, currentPath);
      addToast(`上传成功`, 'success');
      await loadDir(currentPath);
    } catch (err) {
      if (err) addToast(`上传失败: ${err}`, 'error');
    } finally {
      setTransferInfo(null);
    }
  };

  // Download file via Wails native file dialog
  const handleDownload = async (item) => {
    const remotePath = currentPath === '/'
      ? `/${item.name}`
      : `${currentPath}/${item.name}`;
    
    try {
      setTransferInfo({ name: item.name, progress: 0, direction: 'download' });
      await AppGo.DownloadFile(sessionId, remotePath);
      addToast(`下载成功: ${item.name}`, 'success');
    } catch (err) {
      if (err) addToast(`下载失败: ${err}`, 'error');
    } finally {
      setTransferInfo(null);
    }
  };

  // Open file editor
  const handleEdit = async (item) => {
    const remotePath = currentPath === '/'
      ? `/${item.name}`
      : `${currentPath}/${item.name}`;
    try {
      const content = await AppGo.ReadFile(sessionId, remotePath);
      setEditFile({ path: remotePath, name: item.name, content });
    } catch (err) {
      addToast(`无法打开文件: ${err}`, 'error');
    }
  };

  // Save file from editor
  const handleSaveFile = async (path, content) => {
    try {
      await AppGo.WriteFile(sessionId, path, content);
      addToast('文件保存成功', 'success');
      setEditFile(null);
    } catch (err) {
      addToast(`保存失败: ${err}`, 'error');
    }
  };

  // Delete
  const handleDelete = async (item) => {
    const remotePath = currentPath === '/'
      ? `/${item.name}`
      : `${currentPath}/${item.name}`;
    if (!(await window.aetherDialog?.confirm(`确定删除「${item.name}」？此操作不可撤销`))) return;
    try {
      await AppGo.DeleteItem(sessionId, remotePath, item.isDirectory);
      addToast(`已删除: ${item.name}`, 'success');
      await loadDir(currentPath);
    } catch (err) {
      addToast(`删除失败: ${err}`, 'error');
    }
  };

  // Create directory
  const handleMkdir = async () => {
    const name = await window.aetherDialog?.prompt('新文件夹名称:');
    if (!name) return;
    const remotePath = currentPath === '/' ? `/${name}` : `${currentPath}/${name}`;
    try {
      await AppGo.Mkdir(sessionId, remotePath);
      addToast(`文件夹创建成功: ${name}`, 'success');
      await loadDir(currentPath);
    } catch (err) {
      addToast(`创建失败: ${err}`, 'error');
    }
  };

  // Create file
  const handleNewFile = async () => {
    const name = await window.aetherDialog?.prompt('新文件名称:');
    if (!name) return;
    const remotePath = currentPath === '/' ? `/${name}` : `${currentPath}/${name}`;
    try {
      await AppGo.WriteFile(sessionId, remotePath, '');
      addToast(`文件创建成功: ${name}`, 'success');
      await loadDir(currentPath);
    } catch (err) {
      addToast(`创建失败: ${err}`, 'error');
    }
  };

  // Compress
  const handleCompress = async (item) => {
    const remotePath = currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`;
    try {
      setLoading(true);
      addToast(`正在压缩 ${item.name}...`, 'info');
      await AppGo.CompressItem(sessionId, remotePath);
      addToast('压缩成功', 'success');
      await loadDir(currentPath);
    } catch (err) {
      addToast(`压缩失败: ${err}`, 'error');
      setLoading(false);
    }
  };

  // Uncompress
  const handleUncompress = async (item) => {
    const remotePath = currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`;
    try {
      setLoading(true);
      addToast(`正在解压 ${item.name}...`, 'info');
      await AppGo.UncompressItem(sessionId, remotePath);
      addToast('解压成功', 'success');
      await loadDir(currentPath);
    } catch (err) {
      addToast(`解压失败: ${err}`, 'error');
      setLoading(false);
    }
  };

  // Rename
  const startRename = (item) => {
    setRenamingItem(item);
    setRenameValue(item.name);
  };

  const confirmRename = async () => {
    if (!renamingItem || !renameValue.trim() || renameValue === renamingItem.name) {
      setRenamingItem(null);
      return;
    }
    const oldPath = currentPath === '/' ? `/${renamingItem.name}` : `${currentPath}/${renamingItem.name}`;
    const newPath = currentPath === '/' ? `/${renameValue}` : `${currentPath}/${renameValue}`;
    try {
      await AppGo.RenameItem(sessionId, oldPath, newPath);
      addToast('重命名成功', 'success');
      await loadDir(currentPath);
    } catch (err) {
      addToast(`重命名失败: ${err}`, 'error');
    } finally {
      setRenamingItem(null);
    }
  };

  const closeContextMenu = () => setContextMenu(null);

  // ── 拖拽上传 ────────────────────────────────────────────────
  // Check if a file name is a hidden/system file that should be skipped
  function isHiddenFile(name) {
    return /^\./.test(name) || /^Thumbs\.db$/i.test(name) || /^desktop\.ini$/i.test(name);
  }

  // Recursively traverse a FileSystemEntry to collect all File objects
  function traverseEntry(entry) {
    return new Promise((resolve) => {
      if (entry.isFile) {
        if (isHiddenFile(entry.name)) {
          resolve([]);
          return;
        }
        entry.file((file) => {
          file._fullPath = entry.fullPath;
          resolve([file]);
        }, () => resolve([]));
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const allEntries = [];
        let emptyCount = 0;
        function readBatch() {
          reader.readEntries((entries) => {
            if (entries.length === 0) {
              emptyCount++;
              // 连续两次返回空数组才确认读取完成（规避 Chrome readEntries 提前返回的 bug）
              if (emptyCount >= 2) {
                Promise.all(allEntries.map((e) => traverseEntry(e))).then((results) => {
                  resolve(results.flat());
                });
              } else {
                readBatch();
              }
            } else {
              allEntries.push(...entries);
              emptyCount = 0;
              readBatch();
            }
          }, () => resolve([]));
        }
        readBatch();
      } else {
        resolve([]);
      }
    });
  }

  // Read a File as Array<number> for sending to the backend (via Wails JSON serialization)
  function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        // Convert Uint8Array to plain Array so JSON.stringify produces [72,101,...] instead of {"0":72,"1":101,...}
        resolve(Array.from(new Uint8Array(reader.result)));
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    setIsDragOver(true);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragOver(false);
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    dragCounterRef.current = 0;

    const items = Array.from(e.dataTransfer.items);
    const droppedFiles = Array.from(e.dataTransfer.files || []).filter(f => !isHiddenFile(f.name));
    if (items.length === 0 && droppedFiles.length === 0) return;

    setTransferInfo({ name: '正在上传...', progress: 0, direction: 'upload' });

    let fileCount = 0;
    const uploadedNames = new Set(); // 追踪所有已成功上传的文件名
    const pendingFailures = new Set(); // 记录首次上传失败的文件名，待 droppedFiles 兜底后确认

    try {
      // ── 方式一：通过 items + webkitGetAsEntry API（支持文件夹结构） ──
      for (const item of items) {
        const entry = item.webkitGetAsEntry && item.webkitGetAsEntry();

        if (entry && entry.isFile) {
          // ── 单文件上传（读取内容 → 传后端） ──
          let file;
          try { file = item.getAsFile(); } catch (_) { file = null; }
          if (!file) {
            // getAsFile 读取失败不记为失败，留给 droppedFiles 兜底重试
            continue;
          }
          try {
            const content = await readFileAsArrayBuffer(file);
            await AppGo.UploadFileContent(sessionId, file.name, currentPath, content);
            fileCount++;
            uploadedNames.add(file.name);
          } catch (err) {
            if (err.name === 'NotFoundError') {
              console.warn('跳过文件夹占位符:', file.name);
            } else {
              console.warn('上传文件失败，待 droppedFiles 兜底:', file.name, err);
              pendingFailures.add(file.name);
            }
          }

        } else if (entry && entry.isDirectory) {
          // ── 文件夹上传（遍历 + 按目录结构上传） ──
          const files = await traverseEntry(entry);
          if (files.length === 0) continue;

          const dirName = entry.name;
          const baseRemote =
            currentPath === '/' ? `/${dirName}` : `${currentPath}/${dirName}`;

          // 收集目录结构和文件任务
          const subDirs = new Set();
          const fileJobs = [];
          for (const f of files) {
            let relPath = f._fullPath;
            if (relPath.startsWith(entry.fullPath)) {
              relPath = relPath.slice(entry.fullPath.length);
            }
            relPath = relPath.replace(/^\//, '');
            const parts = relPath.split('/');
            parts.pop(); // 去掉文件名
            const subDir = parts.join('/');
            if (subDir) subDirs.add(subDir);
            fileJobs.push({ file: f, subDir });
          }

          // 创建远程目录结构
          try {
            await AppGo.Mkdir(sessionId, baseRemote);
            for (const sd of subDirs) {
              await AppGo.Mkdir(sessionId, `${baseRemote}/${sd}`);
            }
          } catch (err) {
            console.warn('创建目录失败:', baseRemote, err);
          }

          // 读取文件内容并上传（每个文件独立 try-catch，避免一个失败中断全部）
          for (const job of fileJobs) {
            const remoteDir = job.subDir
              ? `${baseRemote}/${job.subDir}`
              : baseRemote;
            try {
              const content = await readFileAsArrayBuffer(job.file);
              await AppGo.UploadFileContent(sessionId, job.file.name, remoteDir, content);
              fileCount++;
              uploadedNames.add(job.file.name);
            } catch (err) {
              console.warn('上传文件失败:', job.file.name, err);
              pendingFailures.add(job.file.name);
            }
          }

        } else if (!entry) {
          // webkitGetAsEntry 返回 null（混合拖拽时常见），尝试 getAsFile 上传
          // 失败不记为最终失败，留给 droppedFiles 兜底
          let file;
          try { file = item.getAsFile(); } catch (_) { file = null; }
          if (!file) continue;
          try {
            const content = await readFileAsArrayBuffer(file);
            await AppGo.UploadFileContent(sessionId, file.name, currentPath, content);
            fileCount++;
            uploadedNames.add(file.name);
          } catch (err) {
            console.warn('getAsFile 上传失败，留给 droppedFiles 兜底:', file.name, err);
            // 不加入 uploadedNames，让 droppedFiles 回退重新尝试
          }
        }
      }

      // ── 方式二：droppedFiles 兜底（无条件执行，避免 fileCount/droppedFiles.length 比较不准） ──
      for (const file of droppedFiles) {
        if (uploadedNames.has(file.name)) continue;
        try {
          const content = await readFileAsArrayBuffer(file);
          await AppGo.UploadFileContent(sessionId, file.name, currentPath, content);
          fileCount++;
          uploadedNames.add(file.name);
          pendingFailures.delete(file.name); // 兜底成功，移出失败记录
        } catch (err) {
          // 某些浏览器会把拖拽的文件夹本身放入 droppedFiles 作为占位符，读取时报 NotFoundError
          if (err.name === 'NotFoundError') {
            console.warn('跳过文件夹占位符:', file.name);
          } else {
            console.warn('上传文件失败:', file.name, err);
            pendingFailures.add(file.name);
          }
        }
      }

      const failCount = pendingFailures.size;
      if (failCount > 0) {
        const failedNames = Array.from(pendingFailures).slice(0, 3).join(', ');
        addToast(`上传完成: ${fileCount} 项成功, ${failCount} 项失败 (${failedNames})`, 'warning');
      } else {
        addToast(`上传成功: ${fileCount} 项`, 'success');
      }
      await loadDir(currentPath);
    } catch (err) {
      if (err) addToast(`上传失败: ${err}`, 'error');
    } finally {
      setTransferInfo(null);
    }
  };

  return (
    <div
      className="file-manager"
      style={{ position: 'relative' }}
      onContextMenu={(e) => {
        e.preventDefault();
        setContextMenu({ pos: { x: e.clientX, y: e.clientY }, item: null });
      }}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Toolbar */}
      <div className="file-toolbar">
        {/* Breadcrumb */}
        <div className="breadcrumb">
          {pathParts.map((part, i) => (
            <span key={part.path} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {i > 0 && <span className="breadcrumb-sep">/</span>}
              <span
                className={`breadcrumb-item ${i === pathParts.length - 1 ? 'current' : ''}`}
                onClick={() => i < pathParts.length - 1 && loadDir(part.path)}
              >
                {part.label}
              </span>
            </span>
          ))}
        </div>

        <button className="btn btn-secondary btn-sm" onClick={handleNewFile}>📄 {t('新建文件')}</button>
        <button className="btn btn-secondary btn-sm" onClick={handleMkdir}>📁 {t('新建文件夹')}</button>
        <button className="btn btn-secondary btn-sm" onClick={handleUpload}>
          ⬆ {t('上传文件')}
        </button>
        <button
          className="btn btn-ghost btn-sm btn-icon"
          title="刷新"
          onClick={() => loadDir(currentPath)}
        >
          ↻
        </button>
      </div>

      {/* File List */}
      <div className="file-list">
        <div className="file-list-header">
          <span>{t('名称')}</span>
          <span>{t('大小')}</span>
          <span>{t('修改时间')}</span>
          <span></span>
        </div>

        {/* Back button */}
        {currentPath !== '/' && (
          <div
            className="file-item"
            onClick={() => {
              const parent = currentPath.substring(0, currentPath.lastIndexOf('/')) || '/';
              loadDir(parent);
            }}
          >
            <div className="file-name-cell">
              <span className="file-icon">↩</span>
              <span className="file-name is-dir">..</span>
            </div>
            <span />
            <span />
            <span />
          </div>
        )}

        {loading && (
          <div className="empty-state">
            <div className="spin" style={{ fontSize: 24 }}>⟳</div>
            <div className="empty-state-text">{t('加载中...')}</div>
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">📂</div>
            <div className="empty-state-text">{t('目录为空')}</div>
          </div>
        )}

        {!loading && items.map((item) => {
          const isRenaming = renamingItem?.name === item.name;

          return (
            <div
              key={item.name}
              className="file-item"
              onDoubleClick={() => item.isDirectory ? navigate(item) : isEditable(item.name) && handleEdit(item)}
              onClick={() => item.isDirectory && navigate(item)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setContextMenu({ pos: { x: e.clientX, y: e.clientY }, item });
              }}
            >
              <div className="file-name-cell">
                <span className="file-icon">{fileIcon(item.name, item.isDirectory)}</span>
                {isRenaming ? (
                  <input
                    className="rename-input"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={confirmRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') confirmRename();
                      if (e.key === 'Escape') setRenamingItem(null);
                    }}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className={`file-name ${item.isDirectory ? 'is-dir' : ''}`}>
                    {item.name}
                  </span>
                )}
              </div>

              <span className="file-size">{item.isDirectory ? '-' : fmtSize(item.size)}</span>
              <span className="file-date">{fmtDate(item.modifyTime)}</span>

              <div className="file-actions">
                {!item.isDirectory && isEditable(item.name) && (
                  <button
                    className="btn btn-ghost btn-sm btn-icon"
                    title="编辑"
                    onClick={(e) => { e.stopPropagation(); handleEdit(item); }}
                  >✏️</button>
                )}
                {!item.isDirectory && (
                  <button
                    className="btn btn-ghost btn-sm btn-icon"
                    title="下载到本地"
                    onClick={(e) => { e.stopPropagation(); handleDownload(item); }}
                  >⬇️</button>
                )}
                <button
                  className="btn btn-ghost btn-sm btn-icon"
                  title="重命名"
                  onClick={(e) => { e.stopPropagation(); startRename(item); }}
                >✏</button>
                <button
                  className="btn btn-ghost btn-sm btn-icon"
                  title="删除"
                  style={{ color: 'var(--red)' }}
                  onClick={(e) => { e.stopPropagation(); handleDelete(item); }}
                >🗑</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Context Menu */}
      {isDragOver && (
        <div className="drag-overlay">
          <div className="drag-overlay-text">⬆ {t('释放以上传文件/文件夹')}</div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          pos={contextMenu.pos}
          item={contextMenu.item}
          t={t}
          onClose={closeContextMenu}
          onDownload={() => { handleDownload(contextMenu.item); closeContextMenu(); }}
          onEdit={() => { handleEdit(contextMenu.item); closeContextMenu(); }}
          onRename={() => { startRename(contextMenu.item); closeContextMenu(); }}
          onDelete={() => { handleDelete(contextMenu.item); closeContextMenu(); }}
          onMkdir={() => { handleMkdir(); closeContextMenu(); }}
          onNewFile={() => { handleNewFile(); closeContextMenu(); }}
          onCompress={() => { handleCompress(contextMenu.item); closeContextMenu(); }}
          onUncompress={() => { handleUncompress(contextMenu.item); closeContextMenu(); }}
        />
      )}

      {/* Transfer Progress Toast */}
      {transferInfo && (
        <div className="transfer-toast">
          <div className="transfer-toast-title">
            {transferInfo.direction === 'upload' ? `⬆ ${t('上传中') || '上传中'}` : `⬇ ${t('下载中') || '下载中'}`}: {transferInfo.name}
          </div>
          <div className="progress-bar-track">
            <div
              className="progress-bar-fill"
              style={{ width: `${transferInfo.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* File Editor Modal */}
      {editFile && (
        <FileEditor
          file={editFile}
          onSave={handleSaveFile}
          onClose={() => setEditFile(null)}
        />
      )}
    </div>
  );
}
