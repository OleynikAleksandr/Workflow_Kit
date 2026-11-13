import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { runHost } from '../src/pty/host.ts';
import { REQUEST_SUFFIX, RESULT_SUFFIX, STATE_SUFFIX } from '../src/pty/interrupt-control.ts';
import type { HostSnapshot, HostResult } from '../src/pty/interrupt-control.ts';

const debug = 'C:/fixture/session.debug';
const frame = (text: string) => `\x1b[2J\x1b[H${text}\r\n`;
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
async function until(check: () => boolean) { for (let i = 0; i < 300; i++) { if (check()) return; await pause(2); } assert.fail('host condition'); }

for (const scenario of ['confirmed', 'late-dialog', 'no-marker'] as const) test(`ConPTY host ${scenario}: fresh classification, explicit proof and no process kill`, async () => {
  let emit!: (text: string) => void;
  let exit!: (code: number) => void;
  let killed = 0;
  const keys: string[] = [];
  const files = new Map<string, string>();
  const done = runHost({ kind: 'session', claude: 'C:/claude.exe', title: 'Test', debug, resume: null, first: null }, {
    start: () => ({ pid: 1, onData: (fn) => { emit = fn; }, onExit: (fn) => { exit = fn; }, kill: () => { killed++; }, write: (text) => {
      keys.push(text);
      if (text === '\x1b') emit(frame(scenario === 'confirmed' ? '[Request interrupted by user]\r\n❯' : '❯'));
      return true;
    } }),
    print: () => undefined,
    takeFile: async (file) => {
      const text = files.get(file) ?? null; files.delete(file);
      if (text && file.endsWith(REQUEST_SUFFIX) && scenario === 'late-dialog') emit(frame('Do you want to proceed?\r\nEsc to cancel'));
      return text;
    },
    putFile: async (file, value) => { files.set(file, JSON.stringify(value)); },
    sleep: pause,
    now: () => Date.now(),
    exit: () => undefined,
  }, { sessionMs: 1000, environmentMs: 1000, pollMs: 2 });
  try {
    emit('https://claude.ai/code/session_FIXTURE\r\n');
    emit(frame('Thinking (esc to interrupt)'));
    await until(() => files.has(debug + STATE_SUFFIX));
    const state = JSON.parse(files.get(debug + STATE_SUFFIX)!) as HostSnapshot;
    const id = randomUUID();
    files.set(debug + REQUEST_SUFFIX, JSON.stringify({ id, epoch: state.epoch, expires: Date.now() + 80 }));
    await until(() => files.has(debug + RESULT_SUFFIX));
    const result = JSON.parse(files.get(debug + RESULT_SUFFIX)!) as HostResult;
    assert.equal(result.id, id);
    assert.equal(result.status, { confirmed: 'interrupted', 'late-dialog': 'unavailable', 'no-marker': 'timeout' }[scenario]);
    assert.deepEqual(keys, scenario === 'late-dialog' ? [] : ['\x1b']);
    assert.equal(killed, 0);
    if (scenario === 'confirmed') {
      files.set(debug + '.text', 'next message');
      await until(() => keys.some((key) => key.includes('next message')));
    }
  } finally { exit(0); await done; }
});

test('ConPTY control-file failure keeps the terminal alive and does not press Escape', async () => {
  let emit!: (text: string) => void;
  let exit!: (code: number) => void;
  let failed = false;
  const keys: string[] = [];
  let killed = false;
  const done = runHost({ kind: 'session', claude: 'claude.exe', title: 'Test', debug, resume: null, first: null }, {
    start: () => ({ pid: 1, onData: (fn) => { emit = fn; }, onExit: (fn) => { exit = fn; }, write: (text) => { keys.push(text); return true; }, kill: () => { killed = true; } }),
    print: () => undefined, takeFile: async () => null, putFile: async () => { failed = true; throw new Error('disk failure'); }, sleep: pause, now: () => Date.now(), exit: () => undefined,
  }, { sessionMs: 1000, environmentMs: 1000, pollMs: 2 });
  try {
    emit('https://claude.ai/code/session_FIXTURE\r\n');
    emit(frame('Thinking (esc to interrupt)'));
    await until(() => failed);
    assert.equal(killed, false);
    assert.deepEqual(keys, []);
  } finally { exit(0); await done; }
});
