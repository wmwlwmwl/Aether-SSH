import { useState, useEffect } from 'react';
import * as AppGo from '../../wailsjs/go/main/App.js';

const defaultForm = {
  name: '',
  host: '',
  port: '22',
  username: 'root',
  authType: 'password',
  password: '',
  privateKey: '',
  passphrase: '',
};

export default function AddServerModal({ server, onSave, onClose }) {
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (server) {
      setForm({
        ...defaultForm,
        ...server,
        authType: server.authMethod ? (server.authMethod === 'privateKey' ? 'key' : 'password') : (server.authType || 'password'),
        password: '',   // 不回显密码
        passphrase: '',
      });
    } else {
      setForm(defaultForm);
    }
  }, [server]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.host.trim()) return alert('请填写主机地址');
    if (!form.username.trim()) return alert('请填写用户名');

    setSaving(true);
    const data = { ...form };
    data.port = parseInt(data.port, 10) || 22; // ensure port is an integer
    data.authMethod = form.authType === 'key' ? 'privateKey' : 'password';
    if (server?.id) data.id = server.id;
    // If editing and password is empty, don't overwrite existing
    if (server?.id && !data.password) delete data.password;
    await onSave(data);
    setSaving(false);
  };

  const handleSelectPrivateKeyFile = async () => {
    try {
      const content = await AppGo.ReadPrivateKeyFile();
      if (content) {
        setForm(f => ({ ...f, privateKey: content }));
      }
    } catch (e) {
      // User cancelled or error
      if (e) alert(`读取私钥文件失败: ${e}`);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-md">
        <div className="modal-header">
          <div className="modal-title">
            <span>{server ? '✏️' : '➕'}</span>
            {server ? '编辑服务器' : '添加服务器'}
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* 基本信息 */}
            <div className="webdav-section">
              <div className="webdav-section-title">🖥 基本信息</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">服务器名称（可选，便于识别）</label>
                  <input
                    className="input"
                    placeholder="例如：生产服务器 / My VPS"
                    value={form.name}
                    onChange={set('name')}
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">主机地址 *</label>
                    <input
                      className="input"
                      placeholder="192.168.1.1 或 example.com"
                      value={form.host}
                      onChange={set('host')}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">端口</label>
                    <input
                      className="input"
                      placeholder="22"
                      type="number"
                      min={1}
                      max={65535}
                      value={form.port}
                      onChange={set('port')}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">用户名 *</label>
                  <input
                    className="input"
                    placeholder="root"
                    value={form.username}
                    onChange={set('username')}
                    required
                  />
                </div>
              </div>
            </div>

            {/* 认证方式 */}
            <div className="webdav-section">
              <div className="webdav-section-title">🔑 认证方式</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">认证类型</label>
                  <select className="select" value={form.authType} onChange={set('authType')}>
                    <option value="password">密码认证</option>
                    <option value="key">私钥认证</option>
                  </select>
                </div>

                {form.authType === 'password' ? (
                  <div className="form-group">
                    <label className="form-label">
                      密码 {server ? '（留空则保留原密码）' : '*'}
                    </label>
                    <input
                      className="input"
                      type="password"
                      placeholder={server ? '留空保留原密码' : '输入 SSH 密码'}
                      value={form.password}
                      onChange={set('password')}
                    />
                  </div>
                ) : (
                  <>
                    <div className="form-group">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <label className="form-label" style={{ marginBottom: 0 }}>私钥内容（PEM/OpenSSH 格式）</label>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={handleSelectPrivateKeyFile} style={{ padding: '2px 8px', fontSize: 11 }}>
                          📁 选择本地私钥文件
                        </button>
                      </div>
                      <textarea
                        className="input"
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 12,
                          resize: 'vertical',
                          minHeight: 100,
                        }}
                        placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
                        value={form.privateKey}
                        onChange={set('privateKey')}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">私钥密码短语（如有）</label>
                      <input
                        className="input"
                        type="password"
                        placeholder="私钥保护密码（可选）"
                        value={form.passphrase}
                        onChange={set('passphrase')}
                      />
                    </div>
                  </>
                )}

                <div className="alert alert-info" style={{ fontSize: 12 }}>
                  ℹ️ 所有凭据均以 AES-256 加密保存在本地，不会上传到任何第三方
                </div>
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? '保存中...' : server ? '保存修改' : '添加服务器'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
