import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { EventsOn, EventsOff } from '../../wailsjs/runtime/runtime.js';
import * as AppGo from '../../wailsjs/go/main/App.js';
import '@xterm/xterm/css/xterm.css';

// 参考 Netcatty / iTerm2 风格：深色带微蓝绿底色
const XTERM_THEME = {
  background:        '#0d1117',
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

    const term = new XTerm({
      theme:            XTERM_THEME,
      fontFamily:       "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      fontSize:         13,
      lineHeight:       1.5,
      letterSpacing:    0.3,
      cursorBlink:      true,
      cursorStyle:      'bar',
      scrollback:       5000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);

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
        const selection = term.getSelection();
        if (selection) navigator.clipboard.writeText(selection);
        return false;
      }
      if (pressedStr === customShortcuts.paste) {
        navigator.clipboard.readText().then((text) => {
          if (text) AppGo.WriteTerminal(sessionId, text);
        });
        return false;
      }
      if (pressedStr === customShortcuts.clear) {
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

    let inputBuffer = '';
    term.onData((data) => {
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
      AppGo.WriteTerminal(sessionId, data);
    });

    term.onResize(({ cols, rows }) => {
      AppGo.ResizeTerminal(sessionId, cols, rows);
    });

    return () => {
      clearTimeout(fitTimer);
      termRef.current     = null;
      fitAddonRef.current = null;
      try { term.dispose(); } catch (_) {}
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

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

  const isConnected  = status === 'connected';
  const isConnecting = status === 'connecting';
  const isError      = status === 'error';

  return (
    <div style={{
      position: 'relative',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: '#0d1117',
    }}>
      {/* ── Session 状态栏（参考 Netcatty Local Terminal 顶栏）── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 14px',
        background: '#161b22',
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
          padding: '4px 4px 2px 8px',
          background: '#0d1117',
        }}
      />
    </div>
  );
}
