import { useState, useEffect } from 'react';
import * as AppGo from '../../wailsjs/go/main/App.js';
import logoImg from '../assets/logo.png';

const TABS = [
  { id: 'network', icon: '🌐', label: '网络' },
  { id: 'appearance', icon: '🎨', label: '外观' },
  { id: 'shortcuts', icon: '⌨️', label: '快捷键' },
  { id: 'sync', icon: '☁️', label: '同步与云' },
  { id: 'app', icon: 'ℹ️', label: '关于' },
];

const defaultWebdavForm = {
  url: 'https://dav.jianguoyun.com/dav/',
  username: '',
  password: '',
  remotePath: '/Aether/',
};

export default function SettingsModal({ onClose, addToast, onRestored }) {
  const [activeTab, setActiveTab] = useState('network');

  // WebDAV state
  const [webdavForm, setWebdavForm] = useState(defaultWebdavForm);
  const [isConfigured, setIsConfigured] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [backing, setBacking] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [backupsList, setBackupsList] = useState([]);
  const [selectedBackup, setSelectedBackup] = useState(null);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [testResult, setTestResult] = useState(null); // null | 'ok' | 'fail'
  const [lastBackup, setLastBackup] = useState(null);

  // Network/Ping state
  const [pingProtocol, setPingProtocol] = useState(localStorage.getItem('pingProtocol') || 'ssh');
  const [probeInterval, setProbeInterval] = useState(parseInt(localStorage.getItem('probeInterval') || '5', 10));

  // Appearance state
  const [themeMode, setThemeMode] = useState(localStorage.getItem('themeMode') || 'dark');
  const [themeAccent, setThemeAccent] = useState(localStorage.getItem('themeAccent') || '#10b981');
  const [useCustomAccent, setUseCustomAccent] = useState(localStorage.getItem('useCustomAccent') === 'true');
  const [language, setLanguage] = useState(localStorage.getItem('appLanguage') || 'zh-CN');
  const [appFont, setAppFont] = useState(localStorage.getItem('appFont') || 'system-ui');

  // Shortcuts state
  const defaultShortcuts = {
    copy: 'Ctrl+C',
    paste: 'Ctrl+V',
    clear: 'Ctrl+L',
    newTab: 'Ctrl+T',
  };
  const [shortcuts, setShortcuts] = useState(() => {
    try {
      const saved = localStorage.getItem('appShortcuts');
      return saved ? JSON.parse(saved) : defaultShortcuts;
    } catch {
      return defaultShortcuts;
    }
  });
  const [listeningKey, setListeningKey] = useState(null); // 'copy' | 'paste' | 'clear' | 'newTab' | null

  // 监听并捕捉组合快捷键
  useEffect(() => {
    if (!listeningKey) return;

    const handleKeyDown = (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

      const keys = [];
      if (e.ctrlKey) keys.push('Ctrl');
      if (e.shiftKey) keys.push('Shift');
      if (e.altKey) keys.push('Alt');
      
      let keyName = e.key;
      if (keyName === ' ') keyName = 'Space';
      else if (keyName.length === 1) keyName = keyName.toUpperCase();
      
      keys.push(keyName);
      const combined = keys.join('+');

      setShortcuts((prev) => {
        const updated = { ...prev, [listeningKey]: combined };
        localStorage.setItem('appShortcuts', JSON.stringify(combined === 'Esc' ? '' : JSON.stringify(updated)));
        // 直接存盘
        localStorage.setItem('appShortcuts', JSON.stringify(updated));
        return updated;
      });

      addToast(`终端快捷键已修改为 ${combined}`, 'success');
      setListeningKey(null);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [listeningKey, addToast]);

  const handleThemeChange = (mode) => {
    setThemeMode(mode);
    localStorage.setItem('themeMode', mode);
    if (mode === 'light') document.body.classList.add('theme-light');
    else document.body.classList.remove('theme-light');
  };

  const handleColorChange = (color) => {
    setThemeAccent(color);
    localStorage.setItem('themeAccent', color);
    if (useCustomAccent) {
      document.documentElement.style.setProperty('--green', color);
    }
  };

  const handleToggleAccent = () => {
    const nextVal = !useCustomAccent;
    setUseCustomAccent(nextVal);
    localStorage.setItem('useCustomAccent', String(nextVal));
    if (nextVal) {
      document.documentElement.style.setProperty('--green', themeAccent);
    } else {
      document.documentElement.style.setProperty('--green', '#10b981');
    }
    addToast(nextVal ? '已启用自定义强调色' : '已恢复默认强调色', 'success');
  };

  const handleLanguageChange = (e) => {
    const lang = e.target.value;
    setLanguage(lang);
    localStorage.setItem('appLanguage', lang);
    addToast(`语言已切换至 ${lang === 'zh-CN' ? '简体中文' : 'English'} (重启后生效)`, 'success');
  };

  const handleFontChange = (e) => {
    const font = e.target.value;
    setAppFont(font);
    localStorage.setItem('appFont', font);
    
    let fontVal = 'var(--font-ui)';
    if (font === 'Open Sans') fontVal = "'Open Sans', sans-serif";
    else if (font === 'Inter') fontVal = "'Inter', sans-serif";
    else if (font === 'JetBrains Mono') fontVal = "'JetBrains Mono', monospace";
    document.body.style.fontFamily = fontVal;
    
    addToast('界面字体已应用', 'success');
  };


  useEffect(() => {
    AppGo.GetWebdavConfig()
      .then((data) => {
        if (data) {
          setWebdavForm((f) => ({
            ...f,
            url: data.url || f.url,
            username: data.username || '',
            remotePath: data.remotePath || f.remotePath,
          }));
          if (data.username) {
            setIsConfigured(true);
          }
        }
      })
      .catch(() => {});
  }, []);

  const setWebdav = (key) => (e) => setWebdavForm((f) => ({ ...f, [key]: e.target.value }));

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await AppGo.TestWebdavConnection(webdavForm.url, webdavForm.username, webdavForm.password);
      setTestResult('ok');
      addToast('WebDAV 连接测试成功 ✓', 'success');
    } catch (err) {
      setTestResult('fail');
      addToast(`WebDAV 连接失败: ${err}`, 'error');
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await AppGo.SaveWebdavConfig(webdavForm);
      addToast('WebDAV 配置已保存', 'success');
      if (webdavForm.username) {
        setIsConfigured(true);
        setIsEditing(false);
      }
    } catch (err) {
      addToast(err, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleBackup = async () => {
    setBacking(true);
    try {
      await AppGo.SaveWebdavConfig(webdavForm);
      const data = await AppGo.BackupToWebdav();
      setLastBackup(data.time);
      addToast(`备份成功！已备份 ${data.count} 个服务器配置`, 'success');
    } catch (err) {
      addToast(`备份失败: ${err}`, 'error');
    } finally {
      setBacking(false);
    }
  };

  const handleRestore = async () => {
    setLoadingBackups(true);
    try {
      const list = await AppGo.ListWebdavBackups();
      if (!list || list.length === 0) {
        addToast('云端未找到任何备份文件', 'error');
        return;
      }
      list.sort((a, b) => new Date(b.time) - new Date(a.time));
      setBackupsList(list);
      setSelectedBackup(list[0].name);
      setConfirmRestore(true);
    } catch (err) {
      addToast(`获取备份列表失败: ${err}`, 'error');
    } finally {
      setLoadingBackups(false);
    }
  };

  const doRestore = async () => {
    if (!selectedBackup) return;
    setConfirmRestore(false);
    setRestoring(true);
    try {
      await AppGo.RestoreFromWebdavFile(selectedBackup);
      addToast('恢复成功', 'success');
      onRestored?.();
    } catch (err) {
      addToast(`恢复失败: ${err}`, 'error');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-xl" style={{ display: 'flex', flexDirection: 'column', height: '80vh', background: 'var(--bg-1)' }}>
        
        {/* Settings Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)' }}>设置</div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ color: 'var(--text-3)' }}>✕</button>
        </div>

        {/* Settings Body Layout */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          
          {/* Settings Sidebar */}
          <div style={{ width: 220, borderRight: '1px solid var(--border)', padding: '16px 8px', display: 'flex', flexDirection: 'column', gap: 4, background: 'var(--bg-0)' }}>
            {TABS.map(tab => (
              <div 
                key={tab.id}
                className={`sidebar-menu-item ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
                style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)' }}
              >
                <span>{tab.icon}</span> {tab.label}
              </div>
            ))}
          </div>

          {/* Settings Content */}
          <div style={{ flex: 1, padding: '32px 48px', overflowY: 'auto', background: 'var(--bg-1)' }}>
            
            {activeTab === 'app' && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '340px',
                height: '100%',
              }}>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '40px 48px',
                  borderRadius: 24,
                  background: 'linear-gradient(135deg, var(--bg-2) 0%, var(--bg-3) 100%)',
                  border: '1px solid var(--border-light)',
                  boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3), inset 0 1px 1px rgba(255,255,255,0.05)',
                  width: '100%',
                  maxWidth: 320,
                  textAlign: 'center',
                  position: 'relative',
                  overflow: 'hidden',
                }}>
                  {/* 背景柔和的高级发光晕影 */}
                  <div style={{
                    position: 'absolute',
                    top: '-30%',
                    left: '-30%',
                    width: '160%',
                    height: '160%',
                    background: 'radial-gradient(circle, rgba(16,185,129,0.08) 0%, rgba(0,0,0,0) 60%)',
                    pointerEvents: 'none',
                  }} />

                  <img 
                    src={logoImg} 
                    alt="Aether" 
                    style={{ 
                      width: 96, 
                      height: 96, 
                      borderRadius: 24, 
                      boxShadow: '0 12px 28px rgba(0, 0, 0, 0.4)',
                      marginBottom: 20,
                      transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.08) rotate(3deg)'}
                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1) rotate(0deg)'}
                  />

                  <div style={{ 
                    fontSize: 24, 
                    fontWeight: 800, 
                    color: 'var(--text-1)',
                    letterSpacing: '-0.5px',
                    marginBottom: 8,
                    background: 'linear-gradient(to right, var(--text-1), #10b981)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}>
                    Aether
                  </div>

                  <div style={{ 
                    fontSize: 13, 
                    color: 'var(--text-4)',
                    fontWeight: 500,
                    letterSpacing: '0.5px',
                  }}>
                    版本 1.0.0
                  </div>

                  <div style={{ 
                    fontSize: 11, 
                    color: 'var(--text-4)',
                    opacity: 0.7,
                    marginTop: 6,
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: '0.5px',
                  }}>
                    by @Angus
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'network' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
                {/* 延迟检测协议 */}
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)', marginBottom: 4 }}>延迟检测协议</div>
                  <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 20 }}>选择如何测量服务器网络延迟，不同协议适用于不同的网络环境。</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[
                      { id: 'ssh', label: 'SSH Banner RTT', desc: '通过读取 SSH 握手包测速，穿透 TUN 代理测出真实网络延迟，推荐', tag: '推荐' },
                      { id: 'tcp', label: 'TCP Dial', desc: '通过 TCP 连接建立测速，适用于局域网/私有网络或未开代理的环境' },
                    ].map(opt => (
                      <div
                        key={opt.id}
                        onClick={() => { setPingProtocol(opt.id); localStorage.setItem('pingProtocol', opt.id); }}
                        style={{
                          display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 16px',
                          background: pingProtocol === opt.id ? 'rgba(34,197,94,0.06)' : 'var(--bg-2)',
                          border: `1px solid ${pingProtocol === opt.id ? 'rgba(34,197,94,0.4)' : 'var(--border)'}`,
                          borderRadius: 10, cursor: 'pointer', transition: 'all 0.15s',
                        }}
                      >
                        <div style={{
                          width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                          border: `2px solid ${pingProtocol === opt.id ? '#22c55e' : 'var(--border)'}`,
                          background: pingProtocol === opt.id ? '#22c55e' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                          {pingProtocol === opt.id && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{opt.label}</span>
                            {opt.tag && <span style={{ fontSize: 10, background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)', color: '#22c55e', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>{opt.tag}</span>}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-4)', marginTop: 3 }}>{opt.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--bg-2)', borderRadius: 8, fontSize: 12, color: 'var(--text-4)', lineHeight: 1.7, border: '1px solid var(--border-light)' }}>
                    💡 <strong style={{ color: 'var(--text-3)' }}>提示：</strong>如果您使用 TUN 模式代理（Clash/V2Ray），推荐使用 <strong>SSH Banner RTT</strong> 模式，可以穿透代理测出真实延迟。
                  </div>
                </div>

                {/* 监控刷新频率 */}
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)', marginBottom: 4 }}>监控刷新频率</div>
                  <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 20 }}>设置探针数据和延迟测试的自动刷新间隔。越高的频率越实时，但资源占用越大。</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 13, color: 'var(--text-2)' }}>探针刷新间隔</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {[3, 5, 10, 30].map(s => (
                          <button
                            key={s}
                            onClick={() => { setProbeInterval(s); localStorage.setItem('probeInterval', String(s)); }}
                            style={{
                              padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid',
                              borderColor: probeInterval === s ? '#22c55e' : 'var(--border)',
                              background: probeInterval === s ? 'rgba(34,197,94,0.1)' : 'var(--bg-3)',
                              color: probeInterval === s ? '#22c55e' : 'var(--text-3)',
                              transition: 'all 0.15s',
                            }}
                          >{s}s</button>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 13, color: 'var(--text-2)' }}>延迟检测间隔</span>
                      <span style={{ fontSize: 12, color: 'var(--text-4)' }}>30 秒（固定）</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'appearance' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
                <div>
                  <h3 style={{ fontSize: 14, color: 'var(--text-1)', marginBottom: 12, fontWeight: 600 }}>语言</h3>
                  <div className="form-group" style={{ background: 'var(--bg-2)', padding: 16, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ color: 'var(--text-1)', fontSize: 13 }}>语言</div>
                        <div style={{ color: 'var(--text-4)', fontSize: 11 }}>选择界面语言</div>
                      </div>
                      <select className="select" style={{ width: 200 }} value={language} onChange={handleLanguageChange}>
                        <option value="zh-CN">简体中文</option>
                        <option value="en-US">English</option>
                      </select>
                    </div>
                    <div className="divider" style={{ margin: '12px 0', borderTop: '1px solid var(--border)' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ color: 'var(--text-1)', fontSize: 13 }}>界面字体</div>
                        <div style={{ color: 'var(--text-4)', fontSize: 11 }}>选择软件界面使用的字体</div>
                      </div>
                      <select className="select" style={{ width: 200 }} value={appFont} onChange={handleFontChange}>
                        <option value="system-ui">系统默认</option>
                        <option value="Open Sans">Open Sans</option>
                        <option value="Inter">Inter</option>
                        <option value="JetBrains Mono">JetBrains Mono</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 style={{ fontSize: 14, color: 'var(--text-1)', marginBottom: 12, fontWeight: 600 }}>界面主题</h3>
                  <div className="form-group" style={{ background: 'var(--bg-2)', padding: 16, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ color: 'var(--text-1)', fontSize: 13 }}>主题</div>
                        <div style={{ color: 'var(--text-4)', fontSize: 11 }}>选择浅色、深色或跟随系统设置</div>
                      </div>
                      <div style={{ display: 'flex', background: 'var(--bg-1)', borderRadius: 'var(--radius-xl)', padding: 4, border: '1px solid var(--border)' }}>
                        <button className={`btn btn-sm ${themeMode === 'light' ? 'btn-secondary' : 'btn-ghost'}`} onClick={() => handleThemeChange('light')} style={{ borderRadius: 'var(--radius-xl)', background: themeMode === 'light' ? 'var(--bg-3)' : 'transparent' }}>☀️ 浅色</button>
                        <button className={`btn btn-sm ${themeMode === 'system' ? 'btn-secondary' : 'btn-ghost'}`} onClick={() => handleThemeChange('system')} style={{ borderRadius: 'var(--radius-xl)', background: themeMode === 'system' ? 'var(--bg-3)' : 'transparent' }}>💻 系统</button>
                        <button className={`btn btn-sm ${themeMode === 'dark' ? 'btn-secondary' : 'btn-ghost'}`} onClick={() => handleThemeChange('dark')} style={{ borderRadius: 'var(--radius-xl)', background: themeMode === 'dark' ? 'var(--bg-3)' : 'transparent' }}>🌙 深色</button>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 style={{ fontSize: 14, color: 'var(--text-1)', marginBottom: 12, fontWeight: 600 }}>强调色</h3>
                  <div className="form-group" style={{ background: 'var(--bg-2)', padding: 16, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                      <div>
                        <div style={{ color: 'var(--text-1)', fontSize: 13 }}>使用自定义强调色</div>
                        <div style={{ color: 'var(--text-4)', fontSize: 11 }}>覆盖主题自带的强调色</div>
                      </div>
                      <div 
                        onClick={handleToggleAccent}
                        style={{ 
                          width: 40, height: 24, 
                          background: useCustomAccent ? 'var(--green)' : 'var(--bg-4)', 
                          borderRadius: 12, position: 'relative', cursor: 'pointer',
                          transition: 'background 0.2s ease',
                          border: '1px solid var(--border)'
                        }}
                      >
                        <div style={{ 
                          position: 'absolute', 
                          left: useCustomAccent ? 18 : 2, 
                          top: 1, width: 20, height: 20, 
                          background: '#fff', borderRadius: '50%',
                          transition: 'left 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.4)'
                        }}></div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {['#3b82f6','#8b5cf6','#d946ef','#f43f5e','#f97316','#eab308','#84cc16','#10b981','#06b6d4','#64748b'].map((color, i) => (
                        <div key={i} onClick={() => handleColorChange(color)} style={{ 
                          width: 24, height: 24, borderRadius: '50%', background: color, cursor: 'pointer',
                          border: themeAccent === color ? '2px solid #fff' : 'none',
                          boxShadow: themeAccent === color ? `0 0 0 2px ${color}` : 'none'
                        }} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'shortcuts' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <div>
                  <h3 style={{ fontSize: 14, color: 'var(--text-1)', marginBottom: 12, fontWeight: 600 }}>终端快捷键</h3>
                  <div className="form-group" style={{ background: 'var(--bg-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ color: 'var(--text-2)', fontSize: 13 }}>从终端复制</span>
                      <button 
                        onClick={() => setListeningKey('copy')} 
                        style={{ 
                          fontFamily: 'var(--font-mono)', fontSize: 12, 
                          color: listeningKey === 'copy' ? 'var(--green)' : 'var(--text-4)', 
                          background: 'var(--bg-1)', padding: '4px 12px', borderRadius: 4, cursor: 'pointer',
                          border: listeningKey === 'copy' ? '1px solid var(--green)' : '1px solid var(--border)',
                          transition: 'var(--transition)'
                        }}
                      >
                        {listeningKey === 'copy' ? '请按下快捷键...' : shortcuts.copy}
                      </button>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ color: 'var(--text-2)', fontSize: 13 }}>粘贴到终端</span>
                      <button 
                        onClick={() => setListeningKey('paste')} 
                        style={{ 
                          fontFamily: 'var(--font-mono)', fontSize: 12, 
                          color: listeningKey === 'paste' ? 'var(--green)' : 'var(--text-4)', 
                          background: 'var(--bg-1)', padding: '4px 12px', borderRadius: 4, cursor: 'pointer',
                          border: listeningKey === 'paste' ? '1px solid var(--green)' : '1px solid var(--border)',
                          transition: 'var(--transition)'
                        }}
                      >
                        {listeningKey === 'paste' ? '请按下快捷键...' : shortcuts.paste}
                      </button>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ color: 'var(--text-2)', fontSize: 13 }}>清空终端缓冲区</span>
                      <button 
                        onClick={() => setListeningKey('clear')} 
                        style={{ 
                          fontFamily: 'var(--font-mono)', fontSize: 12, 
                          color: listeningKey === 'clear' ? 'var(--green)' : 'var(--text-4)', 
                          background: 'var(--bg-1)', padding: '4px 12px', borderRadius: 4, cursor: 'pointer',
                          border: listeningKey === 'clear' ? '1px solid var(--green)' : '1px solid var(--border)',
                          transition: 'var(--transition)'
                        }}
                      >
                        {listeningKey === 'clear' ? '请按下快捷键...' : shortcuts.clear}
                      </button>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
                      <span style={{ color: 'var(--text-2)', fontSize: 13 }}>新建本地标签页</span>
                      <button 
                        onClick={() => setListeningKey('newTab')} 
                        style={{ 
                          fontFamily: 'var(--font-mono)', fontSize: 12, 
                          color: listeningKey === 'newTab' ? 'var(--green)' : 'var(--text-4)', 
                          background: 'var(--bg-1)', padding: '4px 12px', borderRadius: 4, cursor: 'pointer',
                          border: listeningKey === 'newTab' ? '1px solid var(--green)' : '1px solid var(--border)',
                          transition: 'var(--transition)'
                        }}
                      >
                        {listeningKey === 'newTab' ? '请按下快捷键...' : shortcuts.newTab}
                      </button>
                    </div>

                  </div>
                  <p style={{ marginTop: 12, fontSize: 12, color: 'var(--text-4)' }}>注：部分快捷键行为受终端内的 Shell 设置影响。</p>
                </div>
              </div>
            )}

            {activeTab === 'sync' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 600 }}>
                <div style={{ background: 'var(--bg-2)', padding: 24, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--bg-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>☁️</div>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)' }}>WebDAV 配置</div>
                      <div style={{ fontSize: 12, color: 'var(--text-4)' }}>配置 WebDAV 端点用于加密同步服务器列表</div>
                    </div>
                  </div>

                  {isConfigured && !isEditing ? (
                    <div style={{ 
                      background: 'var(--bg-1)', 
                      border: '1px solid var(--border)', 
                      borderRadius: 'var(--radius-md)', 
                      padding: '20px 24px',
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: 16,
                      boxShadow: 'var(--shadow-sm)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ 
                            width: 8, height: 8, 
                            borderRadius: '50%', 
                            background: 'var(--green)',
                            boxShadow: '0 0 8px var(--green)'
                          }}></div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>已成功绑定 WebDAV 服务</div>
                        </div>
                        <button 
                          className="btn btn-ghost btn-sm" 
                          onClick={() => setIsEditing(true)}
                          style={{ 
                            padding: '4px 12px', 
                            borderRadius: 'var(--radius-sm)', 
                            fontSize: 12,
                            border: '1px solid var(--border)',
                            color: 'var(--text-2)'
                          }}
                        >
                          ✏️ 修改配置
                        </button>
                      </div>

                      <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: '80px 1fr', 
                        gap: '8px 16px',
                        fontSize: 13,
                        color: 'var(--text-3)'
                      }}>
                        <div>绑定账号</div>
                        <div style={{ color: 'var(--text-1)', fontWeight: 500, fontFamily: 'var(--font-mono)' }}>{webdavForm.username}</div>
                        <div>备份目录</div>
                        <div style={{ color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{webdavForm.remotePath}</div>
                        <div>服务器</div>
                        <div style={{ color: 'var(--text-2)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{webdavForm.url}</div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <div className="form-group">
                        <label className="form-label">端点地址 (URL)</label>
                        <input className="input" value={webdavForm.url} onChange={setWebdav('url')} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">用户名</label>
                        <input className="input" value={webdavForm.username} onChange={setWebdav('username')} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">密码 / 授权码</label>
                        <input className="input" type="password" value={webdavForm.password} onChange={setWebdav('password')} placeholder="••••••••••••" />
                      </div>
                      <div className="form-group">
                        <label className="form-label">远程保存目录</label>
                        <input className="input" value={webdavForm.remotePath} onChange={setWebdav('remotePath')} />
                      </div>

                      <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'center' }}>
                        <button className="btn btn-secondary" onClick={handleTest} disabled={testing}>
                          {testing ? '测试中...' : '🔌 测试连接'} {testResult === 'ok' && '✓'} {testResult === 'fail' && '✗'}
                        </button>
                        <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
                          {loading ? '保存中...' : '💾 保存配置'}
                        </button>
                        {isEditing && (
                          <button className="btn btn-ghost" onClick={() => setIsEditing(false)} style={{ marginLeft: 'auto' }}>
                            取消
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ background: 'var(--bg-2)', padding: 24, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)', marginBottom: 8 }}>云端同步</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 20 }}>同步所有配置，全程 AES-256 高强加密</div>
                  
                  {lastBackup && <div style={{ fontSize: 12, color: 'var(--green)', marginBottom: 12 }}>上次同步: {lastBackup}</div>}
                  
                  <div style={{ display: 'flex', gap: 12 }}>
                    <button className="btn btn-primary" onClick={handleBackup} disabled={backing}>
                      ☁️ 上传到云端
                    </button>
                    <button className="btn btn-secondary" onClick={handleRestore} disabled={restoring}>
                      🔄 从云端恢复
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>

      </div>
      {/* 确认恢复弹窗（含列表选择） */}
      {confirmRestore && (
        <div className="modal-overlay" style={{ zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="glass-card" style={{ width: 450, padding: 24, animation: 'scaleIn 0.2s ease-out' }}>
            <div style={{ fontSize: 18, color: 'var(--text-1)', marginBottom: 16, fontWeight: 'bold' }}>选择要恢复的云端备份</div>
            <div style={{ color: 'var(--text-2)', marginBottom: 16, fontSize: 14 }}>
              此操作将覆盖当前所有的本地服务器配置，且无法撤销。请选择要恢复的备份时间：
            </div>
            
            <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 20, background: 'var(--bg-0)', borderRadius: 'var(--radius-md)', padding: 8 }}>
              {backupsList.map(bk => (
                <div 
                  key={bk.name}
                  onClick={() => setSelectedBackup(bk.name)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: selectedBackup === bk.name ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
                    border: `1px solid ${selectedBackup === bk.name ? 'var(--primary)' : 'transparent'}`,
                    marginBottom: 4,
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ color: selectedBackup === bk.name ? 'var(--primary)' : 'var(--text-1)' }}>
                    {bk.time}
                  </div>
                  <div style={{ color: 'var(--text-3)', fontSize: 12 }}>
                    {(bk.size / 1024).toFixed(1)} KB
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" style={{ padding: '0 20px' }} onClick={() => setConfirmRestore(false)}>取消</button>
              <button className="btn" style={{ backgroundColor: 'var(--red)', color: '#fff', border: 'none', padding: '0 20px' }} onClick={doRestore} disabled={!selectedBackup}>
                确定恢复
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
