import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { AttachAddon } from '@xterm/addon-attach';
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

  // ── 初始化 xterm + WebSocket 终端通道 ────────────────────────────────
  // xterm.js 通过 AttachAddon + WebSocket 直接连到本地 Go WebSocket 服务器
  // 完全绕开 Wails IPC跨进程通信，走 TCP loopback 延迟极低
  useEffect(() => {
    if (!containerRef.current) return;

    containerRef.current.innerHTML = '';

    const fontSize = parseInt(localStorage.getItem('terminalFontSize') || '13', 10);

    const term = new XTerm({
      theme:            XTERM_THEME,
      fontFamily:       "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      fontSize:         fontSize,
      lineHeight:       1.22,
      letterSpacing:    0.3,
      cursorBlink:      true,
      cursorStyle:      'bar',
      cursorWidth:      1,
      scrollback:       5000,
      allowTransparency: true,
      fastScrollModifier: 'alt',
      macOptionIsMeta:  true,
      windowOptions: {
        setWinSizeChars: true
      }
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);

    // ── WebGL 渲染器 ──────────────────────────────────────────────
    let webglAddon = null;
    try {
      webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon.dispose();
      });
      term.loadAddon(webglAddon);
    } catch (e) {
      console.warn('WebGL addon failed, falling back to DOM renderer.', e);
    }

    termRef.current    = term;
    fitAddonRef.current = fitAddon;

    const fitTimer = setTimeout(() => {
      try { fitAddon.fit(); } catch (_) {}
    }, 100);

    // ── 自定义快捷键 ──────────────────────────────────────────────
    // websocket ref 用于粘贴／快捷键直接发送
    const wsRef = { current: null };

    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true;

      // 1. 获取用户自定义的快捷键配置
      let customShortcuts = { copy: 'Ctrl+C', paste: 'Ctrl+V', clear: 'Ctrl+L', newTab: 'Ctrl+T' };
      try {
        const saved = localStorage.getItem('appShortcuts');
        if (saved) customShortcuts = JSON.parse(saved);
      } catch (_) {}

      // 2. 解析当前按下的组合键字符串（如 "Ctrl+C", "Ctrl+Shift+V"）
      const keys = [];
      if (e.ctrlKey)  keys.push('Ctrl');
      if (e.shiftKey) keys.push('Shift');
      if (e.altKey)   keys.push('Alt');

      let keyName = e.key;
      if (keyName === ' ')           keyName = 'Space';
      else if (keyName.length === 1) keyName = keyName.toUpperCase();
      keys.push(keyName);
      const pressedStr = keys.join('+');

      // ── 自定义复制键（默认 Ctrl+C）：智能处理 ────────
      if (pressedStr === customShortcuts.copy) {
        const selection = term.getSelection();
        if (selection) {
          e.preventDefault();
          navigator.clipboard.writeText(selection);
          term.clearSelection();
          return false; // 已复制，阻止 xterm 把按键发给服务器
        }
        // 【关键】如果没有选区，则直接放行 (return true)
        // 这样如果你用的是 Ctrl+C，它就能变成标准的终端中断指令 (\x03) 发给服务器
        return true; 
      }

      // ── Ctrl+Shift+C：强制系统级复制，作为备用方案 ────────
      if (e.ctrlKey && e.shiftKey && !e.altKey && e.key === 'C') {
        e.preventDefault();
        const selection = term.getSelection();
        if (selection) navigator.clipboard.writeText(selection);
        return false;
      }

      // ── 自定义粘贴键 ───────────────────────────
      if (pressedStr === customShortcuts.paste) {
        e.preventDefault();
        navigator.clipboard.readText().then((text) => {
          if (text && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(new TextEncoder().encode(text));
          }
        });
        return false;
      }

      // ── 自定义清屏键 ───────────────────────────
      if (pressedStr === customShortcuts.clear) {
        e.preventDefault();
        term.clear();
        return false;
      }

      // 新建标签页的快捷键放行给外层 App 处理
      if (pressedStr === customShortcuts.newTab) {
        return true;
      }

      // ── 自定义控制信号（向服务器发送对应的控制字符） ────────────────
      const signalMap = {
        sigint: new Uint8Array([0x03]),     // Ctrl+C (ETX)
        eof: new Uint8Array([0x04]),        // Ctrl+D (EOT)
        suspend: new Uint8Array([0x1a]),    // Ctrl+Z (SUB)
        clearLine: new Uint8Array([0x15])   // Ctrl+U (NAK)
      };

      for (const [key, bytes] of Object.entries(signalMap)) {
        if (customShortcuts[key] && pressedStr === customShortcuts[key]) {
          e.preventDefault();
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(bytes);
          }
          return false;
        }
      }

      // ── 其他标准控制字符全部透传给服务器处理 ────────────────────────
      return true;
    });

    // ── WebSocket 连接 & Predictive Local Echo ─────────────────────
    let ws = null;
    const pendingEchoes = [];

    AppGo.GetWsPort().then((port) => {
      if (!port || !termRef.current) return;
      ws = new WebSocket(`ws://127.0.0.1:${port}/ws/${sessionId}`);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {};

      ws.onmessage = (ev) => {
        if (!termRef.current) return;

        // 如果没有正在预测的字符，直接使用原生 Uint8Array 交给 xterm.js 渲染（最快且无损，避免 TextDecoder 吃字符）
        if (localStorage.getItem('terminalLocalEcho') === 'false' || pendingEchoes.length === 0) {
          termRef.current.write(typeof ev.data === 'string' ? ev.data : new Uint8Array(ev.data));
          return;
        }

        // --- 预测匹配阶段 ---
        let text = typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data);
        let i = 0;
        let newText = '';
        
        while (i < text.length) {
          // 1. 跳过 ANSI 转义序列，原样保留
          if (text[i] === '\x1b' && text[i+1] === '[') {
            let j = i + 2;
            while (j < text.length) {
              const c = text[j];
              if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')) { j++; break; }
              j++;
            }
            newText += text.substring(i, j);
            i = j;
            continue;
          }
          if (text[i] === '\x1b') {
            newText += text.substring(i, Math.min(i + 2, text.length));
            i += 2;
            continue;
          }

          // 2. 匹配回显字符并丢弃
          if (pendingEchoes.length > 0) {
            const expected = pendingEchoes[0];
            if (text[i] === expected) {
              pendingEchoes.shift();
              i++;
              continue;
            }
            if (expected === '\x7F' && text[i] === '\b') {
              pendingEchoes.shift();
              i++;
              continue;
            }
          }
          
          // 不匹配，停止预测，清空队列，正常输出
          pendingEchoes.length = 0;
          newText += text[i];
          i++;
        }
        
        // 写回经过滤的文本
        termRef.current.write(newText);
      };

      ws.onerror = (e) => console.error('[Terminal] WebSocket error', e);
    });

    // ── 历史指令记录 + 输入直通 + Local Echo ────────────────────────
    let inputBuffer = '';
    let cwdTimer = null;
    let localInputLength = 0; // 用于保护提示符，防止退格越界

    term.onData((data) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(new TextEncoder().encode(data));
      }

      // Local Echo 逻辑
      if (localStorage.getItem('terminalLocalEcho') !== 'false') {
        // 如果输入中不包含控制字符（如方向键、Esc、退格等），则视作常规可见输入（支持多字符连击或粘贴）
        if (!/[\x00-\x1F\x7F]/.test(data)) {
          // 由于 JavaScript 中部分多字节字符的 length 表现，这里按照字符串常规长度累加是安全的，
          // 因为退格也是按字符来删的。
          localInputLength += data.length;
          for (let i = 0; i < data.length; i++) {
            pendingEchoes.push(data[i]);
          }
          term.write(data);
        } else if (data === '\x7F') { // Backspace
          // 仅当我们确信这是用户刚刚输入的字符时，才在本地执行退格预测。
          // 否则（localInputLength <= 0），将退格完全交还给服务器，保护提示符不被删除。
          if (localInputLength > 0) {
            localInputLength--;
            pendingEchoes.push(data);
            term.write('\b \b'); // 本地立即执行退格效果
          }
        } else if (data === '\r' || data === '\n' || data === '\r\n') {
          localInputLength = 0;
          pendingEchoes.length = 0;
        } else {
          // 遇到方向键、Ctrl快捷键（如 Ctrl+C/D/Z）等控制符，
          // 立刻清零预测输入长度和回显队列，安全退回到服务器渲染模式
          localInputLength = 0;
          pendingEchoes.length = 0;
        }
      }

      if (data === '\r' || data === '\n' || data === '\r\n') {
        const cmd = inputBuffer.trim();
        if (cmd) {
          window.dispatchEvent(new CustomEvent('ssh-command-history', {
            detail: { sessionId, command: cmd, time: new Date().toISOString() }
          }));
        }
        inputBuffer = '';
        if (window.__cwdListeners?.[sessionId]) {
          clearTimeout(cwdTimer);
          cwdTimer = setTimeout(async () => {
            try {
              const cwd = await AppGo.GetTerminalCwd(sessionId);
              if (cwd) window.dispatchEvent(new CustomEvent('ssh-terminal-cwd-changed', { detail: { sessionId, cwd } }));
            } catch (_) {}
          }, 400);
        }
      } else if (data === '\x7F' || data === '\b') {
        inputBuffer = inputBuffer.slice(0, -1);
      } else if (data.length === 1 && data >= ' ' && data <= '~') {
        inputBuffer += data;
      }
    });

    term.onResize(({ cols, rows }) => {
      AppGo.ResizeTerminal(sessionId, cols, rows);
    });

    return () => {
      clearTimeout(fitTimer);
      clearTimeout(cwdTimer);
      if (ws) { try { ws.close(); } catch (_) {} }
      termRef.current     = null;
      fitAddonRef.current = null;
      if (webglAddon) {
        try { webglAddon.dispose(); } catch (_) {}
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
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, opacity: 0.5, fontFamily: 'var(--font-mono)' }}>
            {isConnected  ? 'Connected'
             : isConnecting ? 'Connecting...'
             : isError      ? 'Error'
             : 'Offline'}
          </span>
          {(isError || status === 'closed') && (
            <button
              onClick={() => {
                window.dispatchEvent(new CustomEvent('ssh-reconnect-trigger', { detail: sessionId }));
              }}
              style={{
                padding: '2px 8px',
                background: 'rgba(34, 197, 94, 0.15)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                borderRadius: '4px',
                color: '#22c55e',
                fontSize: '11px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.target.style.background = 'rgba(34, 197, 94, 0.25)';
                e.target.style.borderColor = 'rgba(34, 197, 94, 0.5)';
              }}
              onMouseLeave={(e) => {
                e.target.style.background = 'rgba(34, 197, 94, 0.15)';
                e.target.style.borderColor = 'rgba(34, 197, 94, 0.3)';
              }}
            >
              重新连接
            </button>
          )}
        </div>
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
