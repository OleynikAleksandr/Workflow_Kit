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
