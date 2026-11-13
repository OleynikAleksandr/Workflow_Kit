import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TerminalScreen } from '../src/index.ts';

test('screen tracks cursor overwrite, clears and split ANSI/OSC without retaining old dialog text', () => {
  const screen = new TerminalScreen(4, 40);
  screen.feed('Esc to cancel\r\n❯ 1. Yes');
  screen.feed('\x1b[');
  screen.feed('2J\x1b[H\x1b]0;title\x07Thinking\r\n❯');
  assert.equal(screen.valid, true);
  assert.match(screen.text(), /Thinking\n❯/);
  assert.doesNotMatch(screen.text(), /cancel|title/);
  screen.feed('\x1b[1;1HReady\x1b[K');
  assert.match(screen.text(), /^Ready\n❯/);
});

test('unsupported terminal operations invalidate classification until a full clear', () => {
  const screen = new TerminalScreen();
  screen.feed('\x1b[1;39rThinking (esc to interrupt)');
  assert.equal(screen.valid, false);
  screen.feed('\x1b[2J\x1b[H❯');
  assert.equal(screen.valid, true);
});
