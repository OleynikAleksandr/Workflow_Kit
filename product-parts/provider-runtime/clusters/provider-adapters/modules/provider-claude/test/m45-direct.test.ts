// M45 T002: sendDirect never pastes into a terminal that is not free — an open dialog, a draft in
// the input (the user's or a command the parameter host left) or an unclean cleanup of the host;
// the message then goes to the channel queue. A free terminal and a session without a fresh host
// state paste as before.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createEventLog, ensureDataDirs, eventsFile, resolveDataDirs } from '#data-store';
import type { ProcessSupervisor } from '#process-supervisor';
import { providerSessionsFile } from '#provider-registry';
import type { Project, ProviderContext } from '#provider-registry';
import { sendDirect } from '../src/direct.ts';
import { createRuntime } from '../src/runtime.ts';
import { DRAFT_REASON, PARAMETER_STATE, UNSAFE_REASON } from '../src/pty/parameter-protocol.ts';

let tmp = '';
let project: Project;
let context: ProviderContext;
const logs: string[] = [];
const hostId = randomUUID(); const sessionId = randomUUID();
const exists = (file: string): Promise<boolean> => access(file).then(() => true, () => false);
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
let debug = '';

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-m45-direct-'));
  const home = path.join(tmp, 'home');
  const folder = path.join(home, 'Projects', 'Alpha');
  await mkdir(path.join(folder, '.workflow-kit', 'local'), { recursive: true });
  await mkdir(path.join(tmp, 'logs'), { recursive: true });
  debug = path.join(tmp, 'logs', 'live.debug.log');
  project = { id: 'p-alpha', name: 'Alpha', path: folder, source: 'created', createdAt: '2026-11-19T07:00:00.000Z' };
  const dirs = resolveDataDirs({ platform: process.platform, env: { WFK_DATA_DIR: path.join(tmp, 'data') }, homedir: home });
  await ensureDataDirs(dirs);
  const supervisor = { quickCheck: async (id: string) => (id === 'proc-live' ? 'alive' : 'gone') } as unknown as ProcessSupervisor;
  context = {
    platform: process.platform, env: {}, homedir: home, dirs,
    config: { port: 0, projectsRoot: path.join(home, 'Projects'), programs: {} },
    events: createEventLog({ file: eventsFile(dirs) }), supervisor,
    runCommand: async () => ({ code: 1, signal: null, stdout: '', stderr: '', timedOut: false, startError: null }),
    now: () => new Date(), log: (line) => void logs.push(line),
  } as ProviderContext;
  const file = providerSessionsFile(dirs, 'claude');
  await mkdir(path.dirname(file), { recursive: true });
  const record = { localId: sessionId, remoteId: 'session_live', title: 'Live', projectId: project.id, projectPath: project.path, origin: 'panel',
    createdAt: '2026-11-19T07:00:00.000Z', startedAt: '2026-11-19T07:00:00.000Z', processId: 'proc-live', claudePid: null,
    logFile: path.join(tmp, 'logs', 'live.log'), debugFile: debug, stoppedAt: null, controlHostId: hostId };
  await writeFile(file, JSON.stringify({ version: 1, sessions: [record], environments: [] }));
});
after(async () => { await rm(tmp, { recursive: true, force: true }); });

async function hostState(status: string, inputEmpty: boolean, reason: string | null, at = Date.now()): Promise<void> {
  await writeFile(debug + PARAMETER_STATE, JSON.stringify({ version: 1, hostId, sessionId, epoch: `${hostId}:7`, at, cliVersion: '2.1.328', status, inputEmpty, reason,
    model: null, effort: null, mode: 'auto', fast: null, ultracode: null, ultracodeAvailable: false, models: [], efforts: [], effortRecommended: null, fastReason: null, pending: null, wantedFile: true }));
}

/** Takes <debug>.text like the session script. */
function script(): { taken: string[]; stop(): void } {
  const taken: string[] = []; let running = true;
  void (async () => { while (running) { await sleep(10); const text = await readFile(debug + '.text', 'utf8').catch(() => null); if (text !== null) { taken.push(text); await rm(debug + '.text', { force: true }); } } })();
  return { taken, stop: () => void (running = false) };
}

for (const [label, status, inputEmpty, reason] of [
  ['a draft in the input', 'unknown', false, DRAFT_REASON],
  ['an open dialog', 'dialog', false, 'Терминал Claude занят или не распознан'],
  ['an unclean cleanup of the host', 'dialog', false, UNSAFE_REASON],
] as const) test(`${label}: the message is not pasted and goes to the queue`, async () => {
  const rt = createRuntime(context, { directWaitMs: 300 });
  await hostState(status, inputEmpty, reason);
  logs.length = 0;
  assert.equal(await sendDirect(rt, project, sessionId, 'составь план'), false);
  assert.equal(await exists(debug + '.text'), false);
  assert.ok(logs.some((line) => line.includes('not pasted: the terminal is not free')), logs.join('\n'));
});

test('a free terminal, and a session without a fresh host state, paste as before', async () => {
  const rt = createRuntime(context, { directWaitMs: 2000 });
  const taker = script();
  try {
    await hostState('idle', true, null);
    assert.equal(await sendDirect(rt, project, sessionId, 'first'), true);
    await hostState('dialog', false, DRAFT_REASON, Date.now() - 60_000);
    assert.equal(await sendDirect(rt, project, sessionId, 'second'), true, 'a stale state is no state');
    assert.deepEqual(taker.taken, ['first', 'second']);
  } finally { taker.stop(); }
});
