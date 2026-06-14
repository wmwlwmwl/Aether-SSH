import test from 'node:test';
import assert from 'node:assert/strict';

import { reduceTerminalHistoryInput } from './terminalHistory.js';

test('records sudo -i even when input arrives in uneven chunks', () => {
  let state = { buffer: '', commands: [] };
  state = reduceTerminalHistoryInput(state, 'sudo ');
  state = reduceTerminalHistoryInput(state, '-');
  state = reduceTerminalHistoryInput(state, 'i');
  state = reduceTerminalHistoryInput(state, '\r');

  assert.deepEqual(state.commands, ['sudo -i']);
  assert.equal(state.buffer, '');
});

test('records pasted bash process-substitution commands wrapped in bracketed paste markers', () => {
  const command = '.bash <(curl -sSLm 10 https://example.com/install.sh)';
  const state = reduceTerminalHistoryInput(
    { buffer: '', commands: [] },
    `\x1b[200~${command}\x1b[201~\r`,
  );

  assert.deepEqual(state.commands, [command]);
  assert.equal(state.buffer, '');
});

test('does not double-record when the terminal sends CRLF together', () => {
  const state = reduceTerminalHistoryInput(
    { buffer: '', commands: [] },
    'echo ok\r\n',
  );

  assert.deepEqual(state.commands, ['echo ok']);
  assert.equal(state.buffer, '');
});

test('keeps pasted command text in the buffer until enter arrives separately', () => {
  const command = 'bash <(curl -sSLm 10 https://example.com/install.sh)';
  let state = reduceTerminalHistoryInput({ buffer: '', commands: [] }, command);
  assert.deepEqual(state.commands, []);
  assert.equal(state.buffer, command);

  state = reduceTerminalHistoryInput(state, '\r');
  assert.deepEqual(state.commands, [command]);
  assert.equal(state.buffer, '');
});
