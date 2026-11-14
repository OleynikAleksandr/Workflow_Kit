import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { InterruptControl, screenState } from '../src/pty/interrupt-control.ts';

const frame = (text: string) => `\x1b[2J\x1b[H${text}\r\n`;
const BUSY = 'Thinking (esc to interrupt)';
const IDLE = '❯';
const MARKER = '[Request interrupted by user]';
const DIALOGS = ['Enter to confirm · Esc to cancel', 'Do you want to proceed?\r\n❯ 1. Yes', 'Allow external CLAUDE.md file imports?', 'Quick safety check: trust this folder', 'Syntax theme', 'New unknown screen'];
function world() {
  let now = 100;
  const keys: string[] = [];
  const control = new InterruptControl('instance', () => now, (text) => { keys.push(text); return true; });
  const request = () => ({ id: randomUUID(), epoch: control.snapshot().epoch, expires: now + 1000 });
  return { control, keys, request, expire: () => { now += 1001; } };
}

test('only a fresh marker plus ready input proves interruption; no Stop hook is needed', () => {
  const w = world();
  w.control.feed(frame(`${MARKER}\r\n${BUSY}`));
  assert.equal(w.control.request(w.request()), null);
  assert.deepEqual(w.keys, ['\x1b']);
  w.control.feed(frame(IDLE));
  assert.equal(w.control.poll(), null, 'old marker does not prove anything');
  w.control.feed(frame(`${MARKER}\r\n${IDLE}`));
  assert.equal(w.control.poll(), null, 'redrawing the old marker is insufficient');
  w.control.feed(frame(`${MARKER}\r\n${MARKER}\r\n${IDLE}`));
  assert.equal(w.control.poll()!.status, 'interrupted');
});

test('marker is counted once across chunks and redraws cannot restore an old idle/footer', () => {
  const w = world();
  w.control.feed(frame(BUSY));
  w.control.request(w.request());
  w.control.feed('[Request inter');
  w.control.feed(`rupted by user]\r\n${IDLE}`);
  assert.equal(w.control.snapshot().state, 'working', 'old busy footer is still visible');
  assert.equal(w.control.poll(), null);
  w.control.feed(frame(`${MARKER}\r\n${IDLE}`));
  assert.equal(w.control.poll()!.status, 'interrupted');
});

test('M28: a dialog at the press takes one Esc (a denial); an unknown screen does only inside a hook turn', () => {
  for (const screen of DIALOGS) {
    const w = world();
    w.control.feed(frame(BUSY));
    const request = w.request();
    w.control.feed(frame(screen));
    const dialog = screenState(w.control.screen) === 'dialog';
    const result = w.control.request(request);
    if (dialog) { assert.equal(result, null, screen); assert.deepEqual(w.keys, ['\x1b']); }
    else { assert.equal(result!.status, 'unavailable', screen); assert.deepEqual(w.keys, []); }
  }
  const w = world(); w.control.feed(frame(BUSY)); const request = w.request(); w.control.feed(frame('New unknown screen'));
  w.control.turnWorking = true; assert.equal(w.control.request(request), null); assert.deepEqual(w.keys, ['\x1b']);
});
test('M28: the 2.1.325 notice confirms the interruption', () => {
  const w = world(); w.control.feed(frame(BUSY)); assert.equal(w.control.request(w.request()), null);
  w.control.feed(frame('  ⎿  Interrupted · What should Claude do instead?\r\n❯'));
  assert.equal(w.control.poll()?.status, 'interrupted');
});

const RULE = '─'.repeat(40);
const input = (above: string, prompt = '❯ ') => frame(`${above}\r\n${RULE}\r\n${prompt}\r\n${RULE}\r\n  ? for shortcuts`);
// Claude 2.1.325 moves the cursor instead of printing spaces and colours each word (T007 live run).
const SPLIT_NOTICE = '  ⎿  \x1b[38;5;246mInterrupted\x1b[39m\x1b[1C·\x1b[1C\x1b[2mWhat\x1b[1Cshould\x1b[1CClaude\x1b[1Cdo\x1b[1Cinstead?\x1b[22m';
test('M28 T010: the frame confirms Stop when control codes split the notice in the raw stream', () => {
  const w = world();
  w.control.feed(input('● Write(note.txt)\r\n Do you want to proceed?\r\n ❯ 1. Yes\r\n   2. No'));
  assert.equal(w.control.snapshot().state, 'dialog');
  assert.equal(w.control.request(w.request()), null);
  assert.deepEqual(w.keys, ['\x1b']);
  w.control.feed(input(`● Write(note.txt)\r\n${SPLIT_NOTICE}`));
  assert.equal(w.control.snapshot().state, 'idle');
  assert.equal(w.control.poll()?.status, 'interrupted');
});
test('M28 T010: a new notice above the input confirms Stop even when an old one scrolled away', () => {
  const w = world();
  const history = Array.from({ length: 30 }, (_, i) => `line ${i}`);
  w.control.feed(input(['  ⎿  Interrupted · What should Claude do instead?', ...history, '✻ Schlepping… (16s · ↓ 206 tokens)'].join('\r\n')));
  assert.equal(w.control.snapshot().state, 'working');
  assert.equal(w.control.request(w.request()), null);
  w.control.feed(input([...history.slice(1), '  ⎿  Interrupted · What should Claude do instead?'].join('\r\n')));
  assert.equal(w.control.poll()?.status, 'interrupted');
});
test('M28 T010: an old notice right above the input does not confirm a new press', () => {
  const w = world();
  w.control.feed(input('  ⎿  Interrupted · What should Claude do instead?\r\n✻ Schlepping… (3s)'));
  assert.equal(w.control.request(w.request()), null);
  w.control.feed(input('  ⎿  Interrupted · What should Claude do instead?'));
  assert.equal(w.control.poll(), null, 'the same notice redrawn');
  w.control.feed(input('  ⎿  Interrupted · What should Claude do instead?\r\n  ⎿  Interrupted · What should Claude do instead?'));
  assert.equal(w.control.poll()?.status, 'interrupted');
});

test('same completed epoch is already-idle; a successor busy epoch is stale and receives no key', () => {
  const w = world();
  w.control.feed(frame(BUSY));
  const old = w.request();
  w.control.feed(frame(IDLE));
  assert.equal(w.control.request(old)!.status, 'already-idle');
  w.control.feed(frame(BUSY));
  assert.equal(w.control.request(old)!.status, 'stale');
  assert.deepEqual(w.keys, []);
});

test('unconfirmed Esc expires without claiming success; expired requests and unknown controls never send keys', () => {
  const w = world();
  w.control.feed(frame(BUSY));
  w.control.request(w.request());
  w.expire();
  assert.equal(w.control.poll()!.status, 'timeout');
  const request = { ...w.request(), expires: 0 };
  assert.equal(w.control.request(request)!.status, 'timeout');
  w.control.feed('\x1b[1;39r');
  assert.equal(w.control.request(w.request())!.status, 'unavailable');
  assert.equal(w.keys.length, 1);
});

test('terminal write failure is unavailable and never leaves a pending success', () => {
  const control = new InterruptControl('instance', () => 0, () => false);
  control.feed(frame(BUSY));
  assert.equal(control.request({ id: randomUUID(), epoch: control.snapshot().epoch, expires: 100 })!.status, 'unavailable');
  assert.equal(control.poll(), null);
});
