import { useState, useEffect, useCallback, useRef } from 'react';
import * as AppGo from '../../wailsjs/go/main/App.js';
import FileEditor from './FileEditor.jsx';

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

// Context menu component
function ContextMenu({ pos, item, onClose, onDownload, onEdit, onRename, onDelete, onMkdir }) {
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
          <span>✏️</span> 编辑
        </div>
      )}
      {item && !item.isDirectory && (
        <div className="context-menu-item" onClick={onDownload}>
          <span>⬇️</span> 下载到本地
        </div>
      )}
      <div className="context-menu-item" onClick={onRename}>
        <span>✏</span> 重命名
      </div>
      <div className="context-menu-divider" />
      {!item && (
        <div className="context-menu-item" onClick={onMkdir}>
          <span>📁</span> 新建文件夹
        </div>
      )}
      {item && (
        <div className="context-menu-item danger" onClick={onDelete}>
          <span>🗑</span> 删除
        </div>
      )}
    </div>
  );
}

export default function FileManager({ sessionId, addToast }) {
  const [currentPath, setCurrentPath] = useState('/');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState(null); // { pos, item }
  const [renamingItem, setRenamingItem] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [editFile, setEditFile] = useState(null);      // { path, name, content }
  const [transferInfo, setTransferInfo] = useState(null);

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

  useEffect(() => { loadDir('/'); }, [loadDir]);

  // Breadcrumb parts
  const pathParts = currentPath === '/'
    ? [{ label: '/', path: '/' }]
    : currentPath.split('/').filter(Boolean).reduce((acc, part, i, arr) => {
        const path = '/' + arr.slice(0, i + 1).join('/');
        acc.push({ label: part, path });
        return acc;
      }, [{ label: '/', path: '/' }]);

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
      setTransferInfo({ name: '正在选择文件...', progress: 50, direction: 'upload' });
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
      setTransferInfo({ name: item.name, progress: 50, direction: 'download' });
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
    if (!confirm(`确定删除「${item.name}」？此操作不可撤销`)) return;
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
    const name = prompt('新文件夹名称:');
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

  return (
    <div
      className="file-manager"
      onContextMenu={(e) => {
        e.preventDefault();
        setContextMenu({ pos: { x: e.clientX, y: e.clientY }, item: null });
      }}
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

        <button className="btn btn-secondary btn-sm" onClick={handleMkdir}>📁 新建文件夹</button>
        <button className="btn btn-secondary btn-sm" onClick={handleUpload}>
          ⬆ 上传文件
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
          <span>名称</span>
          <span>大小</span>
          <span>修改时间</span>
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
            <div className="empty-state-text">加载中...</div>
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">📂</div>
            <div className="empty-state-text">目录为空</div>
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
      {contextMenu && (
        <ContextMenu
          pos={contextMenu.pos}
          item={contextMenu.item}
          onClose={closeContextMenu}
          onDownload={() => { handleDownload(contextMenu.item); closeContextMenu(); }}
          onEdit={() => { handleEdit(contextMenu.item); closeContextMenu(); }}
          onRename={() => { startRename(contextMenu.item); closeContextMenu(); }}
          onDelete={() => { handleDelete(contextMenu.item); closeContextMenu(); }}
          onMkdir={() => { handleMkdir(); closeContextMenu(); }}
        />
      )}

      {/* Transfer Progress Toast */}
      {transferInfo && (
        <div className="transfer-toast">
          <div className="transfer-toast-title">
            {transferInfo.direction === 'upload' ? '⬆ 上传中' : '⬇ 下载中'}: {transferInfo.name}
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
