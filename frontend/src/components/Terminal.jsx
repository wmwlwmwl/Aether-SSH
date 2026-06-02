import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { CanvasAddon } from '@xterm/addon-canvas';
import { EventsOn, EventsOff } from '../../wailsjs/runtime/runtime.js';
import * as AppGo from '../../wailsjs/go/main/App.js';
import '@xterm/xterm/css/xterm.css';
import defaultTermBg from '../assets/term_bg.png';

// 参考 Netcatty / iTerm2 风格：深色带微蓝绿底色
const XTERM_THEME = {
  background:        '#00000000',
  foreground:        '#cdd9e5',
  cursor:            '#22c55e',
  cursorAccent:      '#0d1117',
  selectionBackground: 'rgba(34, 197, 94, 0.20)',
  black:             '#484f58',
  red:               '#ff7b72',
  green:             '#3fb950',
  yellow:            '#d29922',
  blue:              '#58a6ff',
  magenta:           '#bc8cff',
  cyan:              '#39c5cf',
  white:             '#b1bac4',
  brightBlack:       '#6e7681',
  brightRed:         '#ffa198',
  brightGreen:       '#56d364',
  brightYellow:      '#e3b341',
  brightBlue:        '#79c0ff',
  brightMagenta:     '#d2a8ff',
  brightCyan:        '#56d4dd',
  brightWhite:       '#f0f6fc',
};

export default function Terminal({ sessionId, status, isActive, serverName }) {
  const containerRef = useRef(null);
  const termRef      = useRef(null);
  const fitAddonRef  = useRef(null);

  // ── 初始化 xterm ────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    containerRef.current.innerHTML = '';

    const fontSize = parseInt(localStorage.getItem('terminalFontSize') || '13', 10);

    const term = new XTerm({
      theme:            XTERM_THEME,
      fontFamily:       "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      fontSize:         fontSize,
      lineHeight:       1.22,     // 1.22 紧凑行高，让文字排版密度适中，光标自动缩短并与字符等高，精致高级
      letterSpacing:    0.3,
      cursorBlink:      true,
      cursorStyle:      'bar',
      cursorWidth:      1,        // 调整为 1 像素极致纤细光标
      scrollback:       5000,
      allowTransparency: true,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);

    // ── 终端极速渲染器：Canvas 附加组件 ───────────────────────────
    // 使用 xterm.js 的高性能 Canvas 渲染引擎，既能保持极低延迟流畅度，
    // 又能完美原生支持背景透明通道 (allowTransparency)。
    let canvasAddon = null;
    try {
      canvasAddon = new CanvasAddon();
      term.loadAddon(canvasAddon);
    } catch (e) {
      console.warn('Canvas addon failed, falling back to DOM renderer.', e);
    }

    // ── 自定义快捷键 ────────────────────────────────────────────
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true;

      let customShortcuts = { copy: 'Ctrl+C', paste: 'Ctrl+V', clear: 'Ctrl+L' };
      try {
        const saved = localStorage.getItem('appShortcuts');
        if (saved) customShortcuts = JSON.parse(saved);
      } catch (_) {}

      const keys = [];
      if (e.ctrlKey)  keys.push('Ctrl');
      if (e.shiftKey) keys.push('Shift');
      if (e.altKey)   keys.push('Alt');

      let keyName = e.key;
      if (keyName === ' ')           keyName = 'Space';
      else if (keyName.length === 1) keyName = keyName.toUpperCase();
      keys.push(keyName);
      const pressedStr = keys.join('+');

      if (pressedStr === customShortcuts.copy) {
        e.preventDefault();
        const selection = term.getSelection();
        if (selection) navigator.clipboard.writeText(selection);
        return false;
      }
      if (pressedStr === customShortcuts.paste) {
        e.preventDefault();
        navigator.clipboard.readText().then((text) => {
          if (text) AppGo.WriteTerminal(sessionId, text);
        });
        return false;
      }
      if (pressedStr === customShortcuts.clear) {
        e.preventDefault();
        term.clear();
        return false;
      }
      return true;
    });

    termRef.current    = term;
    fitAddonRef.current = fitAddon;

    const fitTimer = setTimeout(() => {
      try { fitAddon.fit(); } catch (_) {}
    }, 100);

    // ── 输入防抖缓冲管线 ──────────────────────────────────────────
    let inputBuffer = '';      // 仅用于本地指令历史提取
    let sendBuffer = '';       // 用于防止 IPC 拥塞的发送缓冲
    let sendTimer = null;
    let isCooldown = false;

    term.onData((data) => {
      // 记录历史指令逻辑
      if (data === '\r' || data === '\n' || data === '\r\n') {
        const cmd = inputBuffer.trim();
        if (cmd) {
          window.dispatchEvent(new CustomEvent('ssh-command-history', {
            detail: { sessionId, command: cmd, time: new Date().toISOString() }
          }));
        }
        inputBuffer = '';
      } else if (data === '\x7F' || data === '\b') {
        inputBuffer = inputBuffer.slice(0, -1);
      } else if (data.length === 1 && data >= ' ' && data <= '~') {
        inputBuffer += data;
      }

      // 前端发送节流逻辑 (首键 0 延迟，后续 5ms 微批聚合)
      if (!isCooldown) {
        // 第一键立刻无阻碍直通后端，手感极佳
        AppGo.WriteTerminal(sessionId, data);
        isCooldown = true;
        sendTimer = setTimeout(() => {
          if (sendBuffer.length > 0) {
            AppGo.WriteTerminal(sessionId, sendBuffer);
            sendBuffer = '';
          }
          isCooldown = false;
        }, 5); // 5ms 等待窗口
      } else {
        // 冷却期内的连续极速输入（如长按退格/高频敲击/粘贴），暂存到缓冲
        sendBuffer += data;
      }
    });

    term.onResize(({ cols, rows }) => {
      AppGo.ResizeTerminal(sessionId, cols, rows);
    });

    return () => {
      clearTimeout(fitTimer);
      clearTimeout(sendTimer); // 确保在卸载时清理定时器
      termRef.current     = null;
      fitAddonRef.current = null;
      if (canvasAddon) {
        try { canvasAddon.dispose(); } catch (_) {}
      }
      try { term.dispose(); } catch (_) {}
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // ── 监听字体大小修改事件 ──────────────────────────────────────
  useEffect(() => {
    const handleFontSizeChange = (e) => {
      if (termRef.current) {
        termRef.current.options.fontSize = e.detail;
        if (fitAddonRef.current) {
          try { fitAddonRef.current.fit(); } catch (_) {}
        }
      }
    };
    window.addEventListener('terminal-font-size-changed', handleFontSizeChange);
    return () => window.removeEventListener('terminal-font-size-changed', handleFontSizeChange);
  }, []);

  // ── 接收 SSH 数据 ───────────────────────────────────────────────
  useEffect(() => {
    const eventName = `terminal-data-${sessionId}`;
    const unbind = EventsOn(eventName, (data) => {
      if (termRef.current) termRef.current.write(data);
    });
    return () => { unbind(); EventsOff(eventName); };
  }, [sessionId]);

  // ── 状态变化提示 ────────────────────────────────────────────────
  useEffect(() => {
    if (!termRef.current) return;
    if (status === 'error') {
      termRef.current.write('\r\n\x1b[31m✗  Connection failed\x1b[0m\r\n');
    } else if (status === 'closed') {
      termRef.current.write('\r\n\x1b[33m●  Disconnected\x1b[0m\r\n');
    }
  }, [status]);

  // ── 激活时 refit ────────────────────────────────────────────────
  useEffect(() => {
    if (!isActive || !fitAddonRef.current || !termRef.current) return;
    const timer = setTimeout(() => {
      try {
        fitAddonRef.current.fit();
        const { cols, rows } = termRef.current;
        AppGo.ResizeTerminal(sessionId, cols, rows);
      } catch (_) {}
    }, 60);
    return () => clearTimeout(timer);
  }, [isActive, sessionId]);

  // ── 窗口变化时 fit ──────────────────────────────────────────────
  useEffect(() => {
    const handleResize = () => {
      if (!isActive || !fitAddonRef.current) return;
      try { fitAddonRef.current.fit(); } catch (_) {}
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isActive]);

  // ── 背景管理与刷新 ────────────────────────────────────────────────
  const [bgInfo, setBgInfo] = useState({
    image: localStorage.getItem('termBgImage') || '',
    opacity: parseFloat(localStorage.getItem('termBgOpacity') || '0.15')
  });

  useEffect(() => {
    const handleBgChange = () => {
      setBgInfo({
        image: localStorage.getItem('termBgImage') || '',
        opacity: parseFloat(localStorage.getItem('termBgOpacity') || '0.15')
      });
    };
    window.addEventListener('terminal-bg-changed', handleBgChange);
    return () => window.removeEventListener('terminal-bg-changed', handleBgChange);
  }, []);

  const isConnected  = status === 'connected';
  const isConnecting = status === 'connecting';
  const isError      = status === 'error';

  return (
    <div style={{
      position: 'relative',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: '#0d1117', // Fallback color
      overflow: 'hidden',
    }}>
      {/* 底层壁纸 */}
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: `url(${bgInfo.image || defaultTermBg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        opacity: bgInfo.opacity,
        pointerEvents: 'none',
        zIndex: 0
      }} />
      
      {/* 内容层(置于背景之上) */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* ── Session 状态栏（极简、高颜值设计） ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 14px',
        background: 'rgba(22, 27, 34, 0.75)',
        backdropFilter: 'blur(8px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        fontSize: 12,
        color: '#8b949e',
        userSelect: 'none',
        flexShrink: 0,
      }}>
        {/* 状态指示灯 */}
        <div style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: isConnected  ? '#22c55e'
                    : isConnecting ? '#f59e0b'
                    : isError      ? '#ef4444'
                    : '#6e7681',
          boxShadow: isConnected  ? '0 0 6px #22c55e'
                   : isConnecting ? '0 0 6px #f59e0b'
                   : isError      ? '0 0 6px #ef4444'
                   : 'none',
          flexShrink: 0,
        }} />
        <span style={{ color: '#cdd9e5', fontWeight: 500, fontFamily: 'var(--font-mono)' }}>
          {serverName || 'Terminal'}
        </span>
        
        {/* 右侧极简状态显示 */}
        <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.5, fontFamily: 'var(--font-mono)' }}>
          {isConnected  ? 'Connected'
           : isConnecting ? 'Connecting...'
           : isError      ? 'Error'
           : 'Offline'}
        </span>
      </div>

      {/* ── xterm 渲染区 ── */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          minHeight: 0,
          padding: '8px 4px 6px 12px',
          background: 'transparent',
        }}
      />
      </div>
    </div>
  );
}
