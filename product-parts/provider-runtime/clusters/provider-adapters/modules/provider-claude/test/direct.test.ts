// sendDirect (spec M18 section 2.2, M19 section 2.1) on a fake supervisor and a simulated session
// script: the cleaned text in <debug>.text, one send per session at a time, false for a session the
// panel does not run and for a file nobody takes (a script of an older version); wakeSession next to
// a waiting text; and readMessages through the hook journal.
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createEventLog, ensureDataDirs, eventsFile, resolveDataDirs } from '#data-store';
import type { ProcessSupervisor } from '#process-supervisor';
import { providerSessionsFile } from '#provider-registry';
import type { Project, ProviderContext } from '#provider-registry';
import { cleanDirectText, directTextFile, sendDirect } from '../src/direct.ts';
import { createClaudeProvider } from '../src/index.ts';
import { createRuntime } from '../src/runtime.ts';
import type { ClaudeRuntime } from '../src/runtime.ts';
import { interruptTurn, refreshInterruptions } from '../src/interrupt.ts';
import { listSessions } from '../src/sessions.ts';
import { REQUEST_SUFFIX, RESULT_SUFFIX, STATE_SUFFIX } from '../src/pty/interrupt-control.ts';
import { withNativeHost } from '../src/native-arbiter.ts';

let tmp = '';
let project: Project;
let context: ProviderContext;
const alive = new Set<string>();
const logs: string[] = [];

const debugFile = (name: string): string => path.join(tmp, 'logs', `${name}.debug.log`);
const exists = (file: string): Promise<boolean> => access(file).then(() => true, () => false);
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function record(name: string, processId: string | null, stoppedAt: string | null = null): Record<string, unknown> {
  return {
    localId: `local-${name}`,
    remoteId: `session_${name}`,
    title: name,
    projectId: project.id,
    projectPath: project.path,
    origin: 'panel',
    createdAt: '2026-11-12T07:00:00.000Z',
    startedAt: '2026-11-12T07:00:00.000Z',
    processId,
    claudePid: null,
    logFile: path.join(tmp, 'logs', `${name}.log`),
    debugFile: debugFile(name),
    stoppedAt,
  };
}

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-claude-direct-'));
  const home = path.join(tmp, 'home');
  const folder = path.join(home, 'Projects', 'Alpha');
  await mkdir(path.join(folder, '.workflow-kit', 'local'), { recursive: true });
  await mkdir(path.join(tmp, 'logs'), { recursive: true });
  project = { id: 'p-alpha', name: 'Alpha', path: folder, source: 'created', createdAt: '2026-11-12T07:00:00.000Z' };
  const dirs = resolveDataDirs({ platform: process.platform, env: { WFK_DATA_DIR: path.join(tmp, 'data') }, homedir: home });
  await ensureDataDirs(dirs);
  const supervisor = { quickCheck: async (id: string) => (alive.has(id) ? 'alive' : 'gone') } as unknown as ProcessSupervisor;
  context = {
    platform: process.platform,
    env: {},
    homedir: home,
    dirs,
    config: { port: 0, projectsRoot: path.join(home, 'Projects'), programs: {} },
    events: createEventLog({ file: eventsFile(dirs) }),
    supervisor,
    runCommand: async () => ({ code: 1, signal: null, stdout: '', stderr: '', timedOut: false, startError: null }),
    now: () => new Date(),
    log: (line) => void logs.push(line),
  } as ProviderContext;
  const file = providerSessionsFile(dirs, 'claude');
  await mkdir(path.dirname(file), { recursive: true });
  const sessions = [record('Live', 'proc-live'), record('Slow', 'proc-slow'), record('Stopped', null, '2026-11-12T08:00:00.000Z'), record('Gone', 'proc-gone', '2026-11-12T08:00:00.000Z')];
  for (const platform of ['darwin', 'linux', 'win32']) {
    sessions.push(record(`Race-${platform}`, `proc-race-${platform}`));
    alive.add(`proc-race-${platform}`);
  }
  await writeFile(file, JSON.stringify({ version: 1, sessions, environments: [] }));
  alive.add('proc-live').add('proc-slow');
});

after(async () => {
  await rm(tmp, { recursive: true, force: true });
});

/** Takes <debug>.text like session.exp: once per pollMs, records the contents in order. */
function script(name: string, pollMs: number): { taken: string[]; stop(): void } {
  const taken: string[] = [];
  let running = true;
  void (async () => {
    while (running) {
      await sleep(pollMs);
      const file = `${debugFile(name)}.text`;
      const text = await readFile(file, 'utf8').catch(() => null);
      if (text !== null) {
        taken.push(text);
        await rm(file, { force: true });
      }
    }
  })();
  return { taken, stop: () => void (running = false) };
}

const runtime = (waitMs: number): ClaudeRuntime => createRuntime(context, { directWaitMs: waitMs });

async function nativeFile(file: string): Promise<void> {
  const deadline = Date.now() + 1500;
  while (!(await exists(file))) {
    assert.ok(Date.now() < deadline, `native file did not arrive: ${file}`);
    await sleep(10);
  }
}

for (const platform of ['darwin', 'linux', 'win32'] as const) {
  test(`${platform}: local/remote aliases share send/Stop ownership without losing or duplicating text`, async () => {
    const name = `Race-${platform}`;
    const debug = debugFile(name);
    const rt = createRuntime({ ...context, platform }, { directWaitMs: 2000, interruptWaitMs: 2000, pollMs: 10 });
    await writeFile(debug + STATE_SUFFIX, JSON.stringify({ version: 1, epoch: 'native-host:1', state: 'working', at: Date.now() }));
    await refreshInterruptions(rt, project, await listSessions(rt, project));
    const before = sendDirect(rt, project, `local-${name}`, 'before Stop');
    await nativeFile(debug + '.text');
    const stop = interruptTurn(rt, project, `session_${name}`, { turnRef: 'original-turn', nativeTurnId: 'native-turn' });
    await sleep(60);
    assert.equal(await exists(debug + REQUEST_SUFFIX), false, 'Stop cannot overlap the current text lease');
    const taken = [await readFile(debug + '.text', 'utf8')];
    await rm(debug + '.text');
    assert.equal(await before, true);
    await nativeFile(debug + REQUEST_SUFFIX);
    const request = JSON.parse(await readFile(debug + REQUEST_SUFFIX, 'utf8')) as { id: string };
    const after = sendDirect(rt, project, `session_${name}`, 'after Stop');
    await sleep(60);
    assert.equal(await exists(debug + '.text'), false, 'the remote alias must wait for the same host ACK');
    await writeFile(debug + RESULT_SUFFIX, JSON.stringify({ id: request.id, status: 'interrupted' }));
    assert.deepEqual(await stop, { status: 'interrupted', stopped: true, proof: 'pty-marker', nativeTurnId: 'native-turn' });
    await nativeFile(debug + '.text');
    taken.push(await readFile(debug + '.text', 'utf8'));
    await rm(debug + '.text');
    assert.equal(await after, true);
    assert.deepEqual(taken, ['before Stop', 'after Stop']);
    assert.equal(await exists(debug + REQUEST_SUFFIX), false);
  });
}

test('a queued Stop keeps its original timeout and cannot write a late native request', { timeout: 2000 }, async () => {
  const debug = debugFile('Race-darwin');
  const rt = createRuntime(context, { interruptWaitMs: 80, pollMs: 10 });
  await writeFile(debug + STATE_SUFFIX, JSON.stringify({ version: 1, epoch: 'native-host:1', state: 'working', at: Date.now() }));
  await refreshInterruptions(rt, project, await listSessions(rt, project));
  let release!: () => void; let entered!: () => void;
  const ready = new Promise<void>(ok => { entered = ok; });
  const held = withNativeHost(rt, debug, async () => { entered(); await new Promise<void>(ok => { release = ok; }); });
  await ready;
  try {
    await assert.rejects(interruptTurn(rt, project, 'local-Race-darwin', { turnRef: 'old', nativeTurnId: null }), { code: 'interrupt-timeout', status: 504 });
    assert.equal(await exists(debug + REQUEST_SUFFIX), false);
  } finally { release(); await held; }
  await withNativeHost(rt, debug, async () => undefined);
  assert.equal(await exists(debug + REQUEST_SUFFIX), false, 'expired admission must not run later');
});

test('a native epoch that changes while Stop waits is never interrupted as the original target', async () => {
  const debug = debugFile('Race-linux');
  const rt = createRuntime(context, { interruptWaitMs: 2000, pollMs: 10 });
  await writeFile(debug + STATE_SUFFIX, JSON.stringify({ version: 1, epoch: 'native-host:1', state: 'working', at: Date.now() }));
  await refreshInterruptions(rt, project, await listSessions(rt, project));
  let release!: () => void; let entered!: () => void;
  const ready = new Promise<void>(ok => { entered = ok; });
  const held = withNativeHost(rt, debug, async () => { entered(); await new Promise<void>(ok => { release = ok; }); });
  await ready;
  const stop = interruptTurn(rt, project, 'local-Race-linux', { turnRef: 'old', nativeTurnId: 'old' });
  await writeFile(debug + STATE_SUFFIX, JSON.stringify({ version: 1, epoch: 'native-host:2', state: 'working', at: Date.now() }));
  await refreshInterruptions(rt, project, await listSessions(rt, project));
  release(); await held;
  assert.deepEqual(await stop, { status: 'stale', stopped: false });
  assert.equal(await exists(debug + REQUEST_SUFFIX), false);
});

test('the text is cleaned: line breaks to LF, control characters and ESC dropped, TAB kept', () => {
  assert.equal(cleanDirectText('a\r\nb\rc\nd\te'), 'a\nb\nc\nd\te');
  assert.equal(cleanDirectText('x\u001b[201~y\u0000\u0007\u007f\u009bz'), 'x[201~yz');
  assert.equal(cleanDirectText('Привет 👋'), 'Привет 👋');
  assert.equal(directTextFile('/l/s.debug.log'), '/l/s.debug.log.text');
});

test('sendDirect writes the cleaned text to <debug>.text; the sends of a session go one after another', async () => {
  const rt = runtime(3000);
  const live = script('Live', 150);
  try {
    const results = await Promise.all([
      sendDirect(rt, project, 'local-Live', 'Первое\r\nсообщение'),
      sendDirect(rt, project, 'local-Live', 'Второе \u001b[201~'),
      sendDirect(rt, project, 'local-Live', 'Третье'),
    ]);
    assert.deepEqual(results, [true, true, true]);
    assert.deepEqual(live.taken, ['Первое\nсообщение', 'Второе [201~', 'Третье']);
    assert.equal(await exists(`${debugFile('Live')}.message`), false, 'no wake file is written');
  } finally {
    live.stop();
  }
});

test('sendDirect is false for a session the panel does not run, an empty text and a file nobody takes', async () => {
  const rt = runtime(400);
  assert.equal(await sendDirect(rt, project, 'local-unknown', 'x'), false, 'no panel record');
  assert.equal(await sendDirect(rt, project, 'local-Stopped', 'x'), false, 'stopped on purpose');
  assert.equal(await sendDirect(rt, project, 'local-Gone', 'x'), false, 'stopped, not interrupted');
  assert.equal(await sendDirect(rt, project, 'local-Live', ' \u001b\u0007 '), false, 'empty after cleaning');
  assert.equal(await exists(`${debugFile('Live')}.text`), false);
  // No script takes the file (a script of an older version): it is deleted and the send is refused.
  assert.equal(await sendDirect(rt, project, 'local-Slow', 'никто не заберёт'), false);
  assert.equal(await exists(`${debugFile('Slow')}.text`), false, 'the untaken file is deleted');
  assert.equal(await exists(`${debugFile('Slow')}.text.partial`), false);
  // A text file that is already there and never taken blocks the next send.
  await writeFile(`${debugFile('Slow')}.text`, 'ждёт');
  assert.equal(await sendDirect(rt, project, 'local-Slow', 'после чужого файла'), false);
  assert.equal(await readFile(`${debugFile('Slow')}.text`, 'utf8'), 'ждёт', 'the waiting file is left alone');
  await rm(`${debugFile('Slow')}.text`);
  // A waiting wake does not block a text: they are different files.
  const slow = script('Slow', 100);
  await writeFile(`${debugFile('Slow')}.message`, 'wake\n');
  try {
    assert.equal(await sendDirect(rt, project, 'local-Slow', 'рядом с пробуждением'), true);
  } finally {
    slow.stop();
    await rm(`${debugFile('Slow')}.message`, { force: true });
  }
  assert.ok(logs.some((line) => /not taken/.test(line)));
});

test('wakeSession writes no wake while a text waits in <debug>.text and does not overwrite a waiting wake', async () => {
  const provider = createClaudeProvider(context, { directWaitMs: 400 });
  assert.equal(provider.marksPanelProcess, true, 'Claude marks the processes the panel runs');
  const text = `${debugFile('Live')}.text`;
  const wake = `${debugFile('Live')}.message`;
  await writeFile(text, 'ждёт');
  assert.equal(await provider.wakeSession!(project, 'local-Live'), true);
  assert.equal(await exists(wake), false, 'the waiting text starts the turn by itself');
  assert.equal(await readFile(text, 'utf8'), 'ждёт');
  await rm(text);
  assert.equal(await provider.wakeSession!(project, 'local-Live'), true);
  assert.equal(await readFile(wake, 'utf8'), 'wake\n');
  await writeFile(wake, 'earlier');
  assert.equal(await provider.wakeSession!(project, 'local-Live'), true);
  assert.equal(await readFile(wake, 'utf8'), 'earlier');
  await rm(wake);
});

test('readMessages reads the transcript the hook journal names; a session without one is an empty page', async () => {
  const transcript = path.join(tmp, 'home', '.claude', 'projects', 'alpha', 'hooked.jsonl');
  await mkdir(path.dirname(transcript), { recursive: true });
  const lines = [
    { type: 'user', uuid: 'u1', timestamp: '2026-11-12T07:01:15.000Z', message: { role: 'user', content: 'Сделай план' } },
    { type: 'assistant', uuid: 'a1', timestamp: '2026-11-12T07:01:20.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'План готов.' }] } },
  ];
  await writeFile(transcript, `${lines.map((l) => JSON.stringify(l)).join('\n')}\n`);
  const journal = path.join(project.path, '.workflow-kit', 'local', 'sessions.jsonl');
  const row = (sessionId: string, transcriptPath: string | null): string =>
    JSON.stringify({ time: '2026-11-12T07:01:00.000Z', client: 'claude', session_id: sessionId, transcript_path: transcriptPath, cwd: project.path, source: 'startup' });
  await writeFile(journal, `${row('hooked', transcript)}\n${row('bare', null)}\n`);
  const provider = createClaudeProvider(context);
  const page = await provider.readMessages!(project, 'hooked', { limit: 100 });
  assert.deepEqual(page, {
    messages: [
      { id: 'u1', role: 'user', text: 'Сделай план', at: '2026-11-12T07:01:15.000Z' },
      { id: 'a1', role: 'assistant', text: 'План готов.', at: '2026-11-12T07:01:20.000Z' },
    ],
    truncated: false,
  });
  assert.deepEqual(await provider.readMessages!(project, 'bare', { limit: 100 }), { messages: [], truncated: false });
  assert.deepEqual(await provider.readMessages!(project, 'local-Live', { limit: 100 }), { messages: [], truncated: false });
});
