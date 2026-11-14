// M28 T012: Stop goes before a busy parameter engine (discovery, `unsafe`) in both hosts.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { stopFirst } from '../src/pty/interrupt-control.ts';
import { runHost } from '../src/pty/host.ts';
import type { HostTerminal } from '../src/pty/host.ts';

const FRAMES = JSON.parse(readFileSync(new URL('./fixtures/m28/claude-2.1.325-frames.json', import.meta.url), 'utf8')).frames as Record<string, { text: string }>;
const paint = (name: string) => `\x1b[2J\x1b[H${FRAMES[name]!.text.split('\n').slice(-40).join('\r\n')}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const CWD = '/Users/user/WorkflowKitProjects/M28_probe/project';
const meta = (hostId: string, at: number) => ({ version: 1, hostId, sessionId: randomUUID(), cwd: CWD, cliVersion: '2.1.325', model: { id: 'claude-haiku-5-5', label: 'Haiku 5.5' }, effort: 'low', fast: false, at });

test('stopFirst: Stop or its proof go first; a transaction cleanup and a user file wait', () => {
  assert.equal(stopFirst(true, false, false, false), true);
  assert.equal(stopFirst(false, false, false, false), false, 'no Stop: the engine decides');
  assert.equal(stopFirst(true, true, false, false), false, 'a transaction still owns the input');
  assert.equal(stopFirst(true, false, true, false), false, 'its cleanup key goes this step');
  assert.equal(stopFirst(true, false, false, true), false, 'a user file takes its 2 s yield');
});

/** The real expect worker process over its line protocol: the macOS and Linux host (OS-independent). */
async function worker(debug: string, hostId: string) {
  const child = spawn(process.execPath, [...process.execArgv, fileURLToPath(new URL('../src/pty/interrupt-worker.ts', import.meta.url)), debug, hostId, CWD], { stdio: ['pipe', 'pipe', 'inherit'] });
  const lines = createInterface({ input: child.stdout! })[Symbol.asyncIterator]();
  const send = async (line: string): Promise<string[]> => {
    child.stdin!.write(line + '\n'); const out: string[] = [];
    for (;;) { const next = await lines.next(); if (next.done) return out; if (next.value === 'DONE') return out; out.push(next.value); }
  };
  const data = (text: string) => send(`DATA ${Buffer.from(text).toString('hex')}`);
  const poll = async () => { const out = await send('POLL'); if (out.includes('PARAM')) await send('COMMIT'); return out; };
  return { send, data, poll, close: () => { child.stdin!.end(); child.kill(); } };
}

test('M28 T012 expect worker: Stop in a permission dialog is sent and confirmed while `unsafe` holds the engine', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wfk-stop-first-'));
  const debug = path.join(dir, 'session.debug.log'); const hostId = randomUUID();
  const w = await worker(debug, hostId);
  try {
    await writeFile(debug + '.parameters-native', JSON.stringify(meta(hostId, Date.now() - 1000)));
    await w.data(paint('idle-empty'));
    await w.poll();
    assert.equal(JSON.parse(await readFile(debug + '.parameters-state', 'utf8')).status, 'control', 'startup discovery runs');
    // The turn starts: the discovery is cancelled in a working frame and leaves `unsafe` for 10 s.
    await writeFile(debug + '.turn', JSON.stringify({ version: 1, state: 'working', at: Date.now(), source: 'hook' }));
    await w.data(paint('working-thinking'));
    let out: string[] = [];
    for (let i = 0; i < 20 && JSON.parse(await readFile(debug + '.parameters-state', 'utf8')).status === 'control'; i++) { out = await w.poll(); await sleep(50); }
    assert.ok(out.includes('BUSY'), 'the engine is busy (unsafe)');
    assert.equal(JSON.parse(await readFile(debug + '.parameters-state', 'utf8')).pending, null, 'the discovery is over, only unsafe holds');
    await w.data(paint('permission-dialog')); await w.poll();
    const state = JSON.parse(await readFile(debug + '.interrupt-state', 'utf8'));
    assert.equal(state.state, 'dialog', 'the screen state is written while the engine is busy');
    const id = randomUUID();
    await writeFile(debug + '.interrupt', JSON.stringify({ id, epoch: state.epoch, expires: Date.now() + 5000 }));
    const pressed = Date.now(); let escapes = 0;
    while (Date.now() - pressed < 2000 && escapes === 0) { out = await w.poll(); escapes = out.filter((l) => l === 'ESC').length; if (!escapes) await sleep(50); }
    assert.equal(escapes, 1, `one Esc within 2 s, long before unsafe ends (10 s): ${out.join(',')}`);
    assert.equal((await w.poll()).includes('ESC'), false, 'no second Esc');
    await w.data(paint('interrupted-idle'));
    await w.poll();
    assert.deepEqual(JSON.parse(await readFile(debug + '.interrupt-result', 'utf8')), { id, status: 'interrupted' });
  } finally { w.close(); await rm(dir, { recursive: true, force: true }); }
});

test('M28 T012 ConPTY host (win32): Stop is sent and confirmed while `unsafe` holds the engine', async () => {
  const DEBUG = 'C:/logs/session-1.debug.log'; const hostId = randomUUID();
  const listeners: Array<(text: string) => void> = []; const exits: Array<(code: number) => void> = []; const written: string[] = []; const files = new Map<string, string>();
  let clock = 1_000_000; let out = ''; let ticking = true;
  const term: HostTerminal = { pid: 1, onData: (l) => void listeners.push(l), onExit: (l) => void exits.push(l), write: (t) => { written.push(t); return true; }, kill: () => {} };
  const emit = (text: string) => listeners.forEach((l) => l(text));
  const deps = {
    start: () => term, print: (t: string) => void (out += t), exit: () => {},
    async takeFile(file: string) { const v = files.get(file); files.delete(file); return v ?? null; },
    async readFile(file: string) { return files.get(file) ?? null; },
    async putFile(file: string, value: unknown) { files.set(file, JSON.stringify(value)); },
    sleep: (ms: number) => { if (ticking) clock += ms; return new Promise<void>((r) => setImmediate(r)); }, now: () => clock,
  };
  const until = async (check: () => boolean, what: string) => { const end = Date.now() + 5000; while (!check() && Date.now() < end) await new Promise((r) => setImmediate(r)); assert.ok(check(), what); };
  const json = (suffix: string) => JSON.parse(files.get(DEBUG + suffix) ?? '{}');
  const done = runHost({ kind: 'session', claude: 'C:/claude.exe', title: 'T', debug: DEBUG, resume: null, first: null, native: { hostId, cwd: CWD } }, deps, { sessionMs: 60_000, environmentMs: 60_000, pollMs: 1000 });
  emit('claude.ai/code/session_Stop2\r\n');
  await until(() => out.includes('SESSION_URL'), 'link');
  files.set(DEBUG + '.parameters-native', JSON.stringify(meta(hostId, clock)));
  emit(paint('idle-empty'));
  await until(() => json('.parameters-state').status === 'control', 'startup discovery runs');
  files.set(DEBUG + '.turn', JSON.stringify({ version: 1, state: 'working', at: clock, source: 'hook' }));
  emit(paint('working-thinking'));
  await until(() => json('.parameters-state').status === 'busy', 'discovery cancelled by the turn');
  // Host time stops: `unsafe` (10 s) cannot run out, so only the Stop priority can send the Esc.
  ticking = false;
  emit(paint('permission-dialog'));
  await until(() => json('.interrupt-state').state === 'dialog', 'the screen state is written while the engine is busy');
  const id = randomUUID(); const escapes = written.filter((t) => t === '\x1b').length;
  files.set(DEBUG + '.interrupt', JSON.stringify({ id, epoch: json('.interrupt-state').epoch, expires: Number.MAX_SAFE_INTEGER }));
  await until(() => written.filter((t) => t === '\x1b').length === escapes + 1, 'one Esc');
  emit(paint('interrupted-idle'));
  await until(() => json('.interrupt-result').id === id, 'result');
  assert.equal(json('.interrupt-result').status, 'interrupted');
  exits.forEach((l) => l(0));
  await done;
});
