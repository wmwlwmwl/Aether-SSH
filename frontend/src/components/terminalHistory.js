const BRACKETED_PASTE_START = '\x1b[200~';
const BRACKETED_PASTE_END = '\x1b[201~';

function skipEscapeSequence(chunk, index) {
  let cursor = index + 1;
  if (cursor >= chunk.length) return cursor;

  const prefix = chunk[cursor];
  if (prefix === '[') {
    cursor += 1;
    while (cursor < chunk.length) {
      const code = chunk.charCodeAt(cursor);
      if (code >= 0x40 && code <= 0x7e) return cursor + 1;
      cursor += 1;
    }
    return cursor;
  }

  if (prefix === ']') {
    cursor += 1;
    while (cursor < chunk.length) {
      if (chunk[cursor] === '\x07') return cursor + 1;
      if (chunk[cursor] === '\x1b' && chunk[cursor + 1] === '\\') return cursor + 2;
      cursor += 1;
    }
    return cursor;
  }

  return cursor + 1;
}

export function reduceTerminalHistoryInput(state, chunk) {
  let buffer = state.buffer || '';
  const commands = [...(state.commands || [])];

  for (let i = 0; i < chunk.length; i += 1) {
    if (chunk.startsWith(BRACKETED_PASTE_START, i)) {
      i += BRACKETED_PASTE_START.length - 1;
      continue;
    }

    if (chunk.startsWith(BRACKETED_PASTE_END, i)) {
      i += BRACKETED_PASTE_END.length - 1;
      continue;
    }

    const char = chunk[i];

    if (char === '\x1b') {
      i = skipEscapeSequence(chunk, i) - 1;
      continue;
    }

    if (char === '\r' || char === '\n') {
      const command = buffer.trim();
      // 与上一条记录去重：相同的命令只记录一次
      if (command && commands[commands.length - 1] !== command) {
        commands.push(command);
      }
      buffer = '';

      if (char === '\r' && chunk[i + 1] === '\n') {
        i += 1;
      }
      continue;
    }

    if (char === '\x7f' || char === '\b') {
      buffer = buffer.slice(0, -1);
      continue;
    }

    if (char >= ' ') {
      buffer += char;
    }
  }

  return { buffer, commands };
}
