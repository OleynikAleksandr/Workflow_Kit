// M28: Claude 2.1.325 frames, hook turn boundaries, interruption without a Stop hook.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { TerminalScreen } from '#pty-host';
import { screenState } from '../src/pty/interrupt-control.ts';
import { parameterFrame } from '../src/pty/parameter-screen.ts';
import { ParameterEngine, insideFolder } from '../src/pty/parameter-engine.ts';
import { ParameterHost } from '../src/pty/parameter-files.ts';
import { TURN_SUFFIX, parseTurn } from '../src/pty/turn-file.ts';
import type { NativeMetadata } from '../src/pty/parameter-protocol.ts';

const FRAMES = JSON.parse(readFileSync(new URL('./fixtures/m28/claude-2.1.325-frames.json', import.meta.url), 'utf8')).frames as Record<string, { text: string }>;
/** Paints a fixture as the bottom of a 40-row screen; `promptCursor` puts the cursor right after ❯. */
function paint(screen: TerminalScreen, name: string, promptCursor = false): void {
  const lines = FRAMES[name]!.text.split('\n').slice(-40);
  screen.feed(`\x1b[2J\x1b[H${lines.join('\r\n')}`);
  if (promptCursor) {
    const row = lines.findLastIndex(l => /^\s*❯/.test(l));
    screen.feed(`\x1b[${row + 1};3H`);
  }
}
const frame = (name: string, promptCursor = false) => { const s = new TerminalScreen(); paint(s, name, promptCursor); return s; };

test('Claude 2.1.325 frames: working lines, idle prompt, dialog and interruption', () => {
  for (const name of ['working-thinking', 'working-tool', 'working-stop-hook']) {
    assert.equal(screenState(frame(name)), 'working', name);
    assert.equal(parameterFrame(frame(name)).kind, 'busy', name);
  }
  for (const name of ['idle-empty', 'interrupted-idle']) {
    assert.equal(screenState(frame(name)), 'idle', name);
    assert.equal(parameterFrame(frame(name)).kind, 'idle', name);
  }
  assert.equal(screenState(frame('permission-dialog')), 'dialog');
  assert.equal(screenState(frame('idle-done-suggestion')), 'idle', 'a finished line is not work');
});
test('a suggestion after the turn is a placeholder only with the cursor before it', () => {
  const suggestion = parameterFrame(frame('idle-done-suggestion', true));
  assert.equal(suggestion.input, 'проверь ещё раз'); assert.equal(suggestion.placeholder, true); assert.equal(suggestion.kind, 'idle');
  const draft = parameterFrame(frame('idle-done-suggestion'));
  assert.equal(draft.placeholder, false); assert.equal(draft.kind, 'unknown', 'a draft with the cursor after it is not empty idle');
});

const hostId = randomUUID(); const sessionId = randomUUID();
function engineWorld() {
  let now = 10_000; const screen = new TerminalScreen(); paint(screen, 'idle-empty');
  const engine = new ParameterEngine(hostId, '/Users/user/WorkflowKitProjects/M28_probe/project', screen, () => now);
  const meta: NativeMetadata = { version: 1, hostId, sessionId, cwd: '/Users/user/WorkflowKitProjects/M28_probe/project/sub', cliVersion: '2.1.325', model: { id: 'claude-haiku-5-5', label: 'Haiku 5.5' }, effort: 'low', fast: false, at: now };
  engine.observe(meta);
  return { engine, screen, meta, advance: (ms: number) => { now += ms; engine.observe(meta); }, now: () => now };
}
test('no transaction during a hook turn; the hook end releases the engine', () => {
  const w = engineWorld();
  assert.equal(w.engine.snapshot().status, 'idle', 'metadata from a subfolder cwd is accepted');
  w.engine.observeTurn({ version: 1, state: 'working', at: w.now(), source: 'hook' });
  const s = w.engine.snapshot(); assert.equal(s.status, 'busy'); assert.equal(s.reason, 'Claude отвечает');
  w.engine.begin({ version: 1, hostId, sessionId, id: randomUUID(), epoch: s.epoch, expires: w.now() + 25_000, field: 'mode', value: 'default' });
  assert.equal(w.engine.takeResult()?.status, 'busy'); assert.equal(w.engine.busy, false);
  w.engine.discover(); assert.equal(w.engine.busy, false, 'no discovery during a turn');
  w.advance(500); w.engine.observeTurn({ version: 1, state: 'idle', at: w.now(), source: 'hook' });
  assert.equal(w.engine.snapshot().status, 'idle');
  w.engine.observeTurn({ version: 1, state: 'working', at: w.now() - 100, source: 'hook' });
  assert.equal(w.engine.snapshot().status, 'idle', 'an older turn record never wins');
});
test('a turn starting during a transaction cancels it', () => {
  const w = engineWorld(); const epoch = w.engine.snapshot().epoch;
  w.engine.begin({ version: 1, hostId, sessionId, id: randomUUID(), epoch, expires: w.now() + 25_000, field: 'mode', value: 'acceptEdits' });
  assert.equal(w.engine.takeResult(), null); assert.equal(w.engine.busy, true);
  w.advance(300); w.engine.observeTurn({ version: 1, state: 'working', at: w.now(), source: 'hook' });
  for (let i = 0; i < 4; i++) { w.advance(250); w.engine.propose(); }
  assert.equal(w.engine.takeResult()?.status, 'cancelled');
});
test('folder containment of the statusline cwd on POSIX and Windows paths', () => {
  assert.equal(insideFolder('/p/project', '/p/project'), true); assert.equal(insideFolder('/p/project/a/b', '/p/project/'), true);
  assert.equal(insideFolder('/p/project-other', '/p/project'), false); assert.equal(insideFolder('/tmp', '/p/project'), false);
  assert.equal(insideFolder('c:/Work/Project/src', 'C:\\work\\project'), true); assert.equal(insideFolder('D:\\work\\project', 'C:\\work\\project'), false);
});

for (const platform of ['darwin', 'linux', 'win32'] as const) test(`${platform}: the host settles a screen-confirmed interruption into <debug>.turn`, async () => {
  let now = 50_000; const screen = new TerminalScreen(); paint(screen, 'working-thinking');
  const files = new Map<string, string>(); const debug = platform === 'win32' ? 'C:\\data\\session.debug.log' : '/data/session.debug.log';
  const host = new ParameterHost(debug, hostId, '/project', screen, {
    async read(f) { return files.get(f) ?? null; }, async take(f) { const v = files.get(f) ?? null; files.delete(f); return v; },
    async put(f, v) { files.set(f, JSON.stringify(v)); },
  }, () => now);
  files.set(debug + TURN_SUFFIX, JSON.stringify({ version: 1, state: 'working', at: now - 1000, source: 'hook' }));
  await host.poll(false);
  now += 500; paint(screen, 'interrupted-idle'); await host.poll(false);
  assert.equal(parseTurn(files.get(debug + TURN_SUFFIX)!)?.state, 'working', 'not before the settle time');
  now += 3000; await host.poll(false);
  const turn = parseTurn(files.get(debug + TURN_SUFFIX)!);
  assert.equal(turn?.state, 'idle'); assert.equal(turn?.source, 'interrupt');
  // A finished turn without the notice stays with the hook state.
  files.set(debug + TURN_SUFFIX, JSON.stringify({ version: 1, state: 'working', at: now, source: 'hook' }));
  now += 100; paint(screen, 'working-tool'); await host.poll(false);
  now += 500; paint(screen, 'idle-empty'); now += 4000; await host.poll(false);
  assert.equal(parseTurn(files.get(debug + TURN_SUFFIX)!)?.state, 'working');
});
test('a user file outranks a transaction: cancelled, at most 2 s of cleanup, then the text goes', () => {
  const w = engineWorld(); const epoch = w.engine.snapshot().epoch;
  assert.equal(w.engine.yieldToUser(), false, 'nothing to wait for');
  w.engine.begin({ version: 1, hostId, sessionId, id: randomUUID(), epoch, expires: w.now() + 25_000, field: 'mode', value: 'acceptEdits' });
  assert.equal(w.engine.busy, true);
  assert.equal(w.engine.yieldToUser(), true, 'the cleanup may run');
  w.advance(1500); assert.equal(w.engine.yieldToUser(), true);
  w.advance(600); assert.equal(w.engine.yieldToUser(), false, 'never longer than 2 s');
  assert.equal(w.engine.busy, false); assert.equal(w.engine.takeResult()?.status, 'cancelled');
});
test('M28 T014: a discovery cancelled by a turn retries on a later free input, at most 3 times and 30 s apart', () => {
  const w = engineWorld();
  const begun = () => w.engine.snapshot().status === 'control';
  w.engine.discover(); assert.equal(begun(), true, 'first attempt');
  const tries: number[] = [1];
  for (let i = 0; i < 4; i++) {
    w.engine.observeTurn({ version: 1, state: 'working', at: w.now(), source: 'hook' });
    w.advance(300); paint(w.screen, 'idle-empty'); w.advance(300); w.engine.propose(); w.engine.propose();
    w.engine.observeTurn({ version: 1, state: 'idle', at: w.now(), source: 'hook' });
    assert.equal(begun(), false, 'cancelled by the turn');
    w.engine.discover(); assert.equal(begun(), false, 'not again within 30 s');
    w.advance(30_000); w.engine.discover(); if (begun()) tries.push(i + 2);
  }
  assert.deepEqual(tries, [1, 2, 3], 'three attempts per model');
});
