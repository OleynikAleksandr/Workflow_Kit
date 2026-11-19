// M47 T003: the terminal host writes the label of its build into the state; the service offers the
// model and effort controls only to a host of its own build. A session started before an update
// (no label, or another one) gets HOST_OUTDATED with what to do.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { TerminalScreen } from '#pty-host';
import type { SessionParameters } from '#provider-registry';
import { HOST_OUTDATED, nativeClaudeParameters } from '../src/parameter-controls.ts';
import { HOST_OUTSIDE_PTY, hostBuild, hostSources } from '../src/pty/host-build.ts';
import { ParameterEngine } from '../src/pty/parameter-engine.ts';
import { FAST_REASON, PARAMETER_NATIVE, PARAMETER_STATE } from '../src/pty/parameter-protocol.ts';
import type { NativeMetadata, NativeParameterState } from '../src/pty/parameter-protocol.ts';
import { Claude2128 } from './claude-2-1-328.ts';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const base: SessionParameters = { items: [], context: null, limits: [], editable: false, style: { font: 'system-ui', ring: 'last' }, at: 'old' } as unknown as SessionParameters;
const native = (extra: Partial<NativeParameterState> = {}): NativeParameterState => ({ version: 1, hostId: randomUUID(), sessionId: randomUUID(), epoch: '', at: Date.now(), cliVersion: '2.1.328', status: 'idle', inputEmpty: true, reason: null,
  model: { id: 'claude-opus-5-5', label: 'Opus 5.5' }, effort: 'high', mode: 'auto', fast: false, ultracode: false, ultracodeAvailable: true, effortRecommended: 'medium',
  models: [{ key: 'native:Opus%205.5', label: 'Opus 5.5', group: 'primary' }], efforts: ['low', 'medium', 'high', 'xhigh', 'max'], fastReason: FAST_REASON, pending: null, wantedFile: true, ...extra });

test('every file the host runs is in the label: relative imports of src/pty and theirs, pty-host by its package', () => {
  const inside = readdirSync(path.join(SRC, 'pty')).filter(name => name.endsWith('.ts')).map(name => path.join(SRC, 'pty', name));
  const seen = new Set<string>(); const outside = new Set<string>(); const packages = new Set<string>();
  const visit = (file: string): void => {
    if (seen.has(file)) return; seen.add(file);
    for (const [, spec] of readFileSync(file, 'utf8').matchAll(/from '([^']+)'/g)) {
      if (spec!.startsWith('#')) { packages.add(`${path.relative(SRC, file).split(path.sep).join('/')} ${spec}`); continue; }
      if (!spec!.startsWith('.')) continue;
      const target = path.resolve(path.dirname(file), spec!);
      if (path.dirname(target) !== path.join(SRC, 'pty')) outside.add(path.relative(SRC, target).split(path.sep).join('/'));
      visit(target);
    }
  };
  inside.forEach(visit);
  assert.deepEqual([...outside].sort(), [...HOST_OUTSIDE_PTY].sort(), 'HOST_OUTSIDE_PTY lists every file outside src/pty the host imports');
  // #provider-registry gives the files outside src/pty their types and errors, not host behaviour.
  for (const entry of packages) assert.ok(/ #pty-host$/.test(entry) || (!entry.startsWith('pty/') && / #provider-registry$/.test(entry)), `unexpected package import ${entry}`);
  const names = hostSources().map(s => s.name);
  for (const name of ['provider-claude/src/pty/session.exp', 'provider-claude/src/pty/interrupt.tcl', 'provider-claude/src/pty/host-build.ts', 'provider-claude/src/pty.ts', 'pty-host/src/screen.ts']) assert.ok(names.includes(name), name);
  assert.match(hostBuild()!, /^[0-9a-f]{12}$/);
});

test('a host of another build or without a label is not offered the controls; the same build is', () => {
  const build = 'aaaaaaaaaaaa';
  for (const state of [native({ hostBuild: 'bbbbbbbbbbbb' }), native()]) {
    const p = nativeClaudeParameters(base, state, { build });
    assert.equal(p.editable, false); assert.equal(p.reason, HOST_OUTDATED); assert.equal(p.presentation?.layout, 'claude-controls');
  }
  const same = nativeClaudeParameters(base, native({ hostBuild: build }), { build });
  assert.equal(same.editable, true); assert.equal(same.reason, undefined);
  assert.equal(nativeClaudeParameters(base, native()).editable, true, 'without the service label nothing is compared');
  assert.match(HOST_OUTDATED, /Остановите сессию и возобновите её/);
});

test('the engine writes its build into the state only when it has one', () => {
  const engine = new ParameterEngine(randomUUID(), '/p', new TerminalScreen(), () => Date.now());
  assert.equal('hostBuild' in engine.snapshot(), false);
  engine.build = 'cccccccccccc';
  assert.equal(engine.snapshot().hostBuild, 'cccccccccccc');
});

test('the ConPTY host (Windows) writes the label of its build into the state', async () => {
  const { runHost } = await import('../src/pty/host.ts');
  const debug = 'C:\\fixture\\session.debug.log'; const hostId = randomUUID(); const sessionId = randomUUID();
  let now = 1_795_100_000_000;
  const meta: NativeMetadata = { version: 1, hostId, sessionId, cwd: 'C:\\project', cliVersion: '2.1.328', model: { id: 'claude-opus-5-5', label: 'Opus 5.5' }, effort: 'xhigh', fast: false, at: now - 10 };
  const claude = new Claude2128(meta, () => now);
  let emit!: (text: string) => void; let exit!: (code: number) => void;
  let state: NativeParameterState | null = null;
  const draw = () => emit(`\x1b[2J\x1b[H${'\r\n'.repeat(4)}${claude.screen()}`);
  const done = runHost({ kind: 'session', claude: 'C:\\claude.exe', title: 'Test', debug, resume: null, first: null, native: { hostId, cwd: 'C:\\project' } }, {
    start: () => ({ pid: 1, onData: (fn) => { emit = fn; }, onExit: (fn) => { exit = fn; }, kill: () => undefined, write: (text) => { claude.input(text); setTimeout(draw, 1); return true; } }),
    print: () => undefined, takeFile: async () => null,
    readFile: async (file) => (file === debug + PARAMETER_NATIVE ? JSON.stringify(meta) : null),
    putFile: async (file, value) => { if (file === debug + PARAMETER_STATE) state = value as NativeParameterState; },
    fileSize: async () => 0, fileSlice: async () => '',
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)), now: () => (now += 50), exit: () => undefined,
  }, { sessionMs: 1000, environmentMs: 1000, pollMs: 2 });
  try {
    emit('https://claude.ai/code/session_FIXTURE\r\n'); draw();
    for (let i = 0; i < 2000 && !state; i++) await new Promise((resolve) => setTimeout(resolve, 2));
    assert.ok(state, 'the state was written');
    assert.equal((state as NativeParameterState).hostBuild, hostBuild());
  } finally { exit(0); await done; }
});
