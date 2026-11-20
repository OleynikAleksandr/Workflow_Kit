// M44 T005, end to end in the service (createApp on loopback, stub providers, a Kit project
// folder): `wfk hook session-start` prints the autopilot line built from the session's mode and
// review (M48: taken from Settings when the session begins) and the run; the Kit grant, not the
// run journal, decides «authorized»; a change of the session card reaches the session with its next
// UserPromptSubmit hook, once, and a Settings change reaches nobody; without the service the line
// is «unknown».
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createRunJournal } from '#autopilot';
import { installStructure } from '#kit-structure';
import { createStubProvider } from '#provider-registry';
import { createApp, main } from '../src/index.ts';
import type { App } from '../src/index.ts';

let tmp = '';
let app: App;
let base = '';
let folder = '';
let env: Record<string, string> = {};
const H = () => ({ Origin: base, 'Content-Type': 'application/json' });
const SESSION = 'm44-owner';

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-m44-agent-'));
  folder = path.join(tmp, 'Projects', 'demo');
  await mkdir(path.join(folder, 'src'), { recursive: true });
  await installStructure(folder);
  app = await createApp({
    env: { WFK_DATA_DIR: path.join(tmp, 'data'), WFK_PORT: '0' },
    homedir: tmp,
    getInterfaces: () => ({}),
    providers: ['claude', 'codex', 'kimi'].map((id) => () => ({ ...createStubProvider({ id, title: id, task: 'T000' }), ...(id === 'kimi' ? { hookDialect: 'kimi' as const } : {}) })),
  });
  const port = (await app.start()).port;
  base = `http://127.0.0.1:${port}`;
  env = { WFK_DATA_DIR: path.join(tmp, 'data'), WFK_PORT: String(port) };
  await app.projects.open(folder);
});

after(async () => {
  await app.stop();
  await rm(tmp, { recursive: true, force: true });
});

async function hook(event: string, input: object, client = 'claude', extra: Record<string, string> = {}): Promise<string> {
  let out = '';
  await main(['hook', event, '--client', client], {
    stdout: (text) => (out += text),
    stderr: () => undefined,
    app: { env: { ...env, CLAUDE_PROJECT_DIR: folder, ...extra }, homedir: tmp },
    cwd: folder,
    readStdin: async () => JSON.stringify(input),
    hookClients: ['claude', 'codex', 'kimi'],
  });
  return out;
}

const start = (client = 'claude', extra: Record<string, string> = {}) => hook('session-start', { session_id: SESSION, source: 'startup', cwd: path.join(folder, 'src'), hook_event_name: 'SessionStart' }, client, extra);
const context = (out: string): string => {
  const answer = JSON.parse(out) as { hookSpecificOutput?: { additionalContext?: string }; message?: string };
  return answer.hookSpecificOutput?.additionalContext ?? answer.message ?? '';
};

test('a new session learns the Settings and that there is no run; each client in its dialect', async () => {
  assert.equal(context(await start()), 'Workflow Kit autopilot: mode=off, review=off; run=none.');
  assert.equal(context(await start('codex')), 'Workflow Kit autopilot: mode=off, review=off; run=none.');
  assert.deepEqual(JSON.parse(await start('kimi')), { message: 'Workflow Kit autopilot: mode=off, review=off; run=none.' });
});

test('a run the journal calls executing but Kit holds no grant for is «NOT authorized»; the session card, not Settings, changes the line', async () => {
  const settings = (await (await fetch(`${base}/api/settings/autopiloting`, { headers: H() })).json()) as { revision: number };
  const saved = await fetch(`${base}/api/settings/autopiloting`, { method: 'POST', headers: H(), body: JSON.stringify({ expectedRevision: settings.revision, mode: 'full', review: false }) });
  assert.equal(saved.status, 200);
  const journal = createRunJournal();
  const run = await journal.create(folder, {
    projectId: (await app.projects.list())[0]!.id, owner: { key: `claude:${SESSION}`, client: 'claude', sessionId: SESSION }, mode: 'full', review: false,
    request: { source: 'user-command', quote: 'Сделай', at: '2026-11-18T10:00:00.000Z', turnId: null, goal: 'g' }, proposal: null, scopeId: 'auto',
    authority: null, phase: 'executing', pausedFrom: null, reason: null, nextAction: null,
  });
  // M48: the session began with Settings «off» (the test above): a resume keeps it.
  assert.match(context(await start()), /^Workflow Kit autopilot: mode=off, review=off; run=/u);
  const card = `${base}/api/projects/${encodeURIComponent(run.projectId)}/sessions/claude:${SESSION}/autopiloting`;
  const own = (await (await fetch(card, { headers: H() })).json()) as { settings: { revision: number } };
  assert.equal((await fetch(card, { method: 'POST', headers: H(), body: JSON.stringify({ expectedRevision: own.settings.revision, mode: 'full' }) })).status, 200);
  const prompt = { session_id: SESSION, cwd: folder, hook_event_name: 'UserPromptSubmit', prompt: 'Как идёт?' };
  assert.match(context(await hook('prompt', prompt)), /Workflow Kit: the autopilot of this session changed: mode=full, review=off\./u);
  const line = context(await start());
  assert.equal(line, `Workflow Kit autopilot: mode=full, review=off; run=${run.runId} NOT authorized (phase executing without a Kit grant). Without a live Kit grant every user decision stays manual: follow the next line of the Kit recovery packet.`);
  assert.ok(/^[\x20-\x7e]+$/u.test(line), 'ASCII only');
  // A Settings change tells nobody; a change of the card: queued without a wake, delivered once.
  const now = (await (await fetch(`${base}/api/settings/autopiloting`, { headers: H() })).json()) as { revision: number };
  await fetch(`${base}/api/settings/autopiloting`, { method: 'POST', headers: H(), body: JSON.stringify({ expectedRevision: now.revision, mode: 'off', review: true }) });
  assert.doesNotMatch(context((await hook('prompt', prompt)) || '{}'), /changed/u, 'Settings reach no session');
  await fetch(card, { method: 'POST', headers: H(), body: JSON.stringify({ expectedRevision: own.settings.revision + 1, review: true }) });
  const first = context(await hook('prompt', prompt));
  assert.match(first, /Workflow Kit: the autopilot of this session changed: mode=full, review=on\./u);
  assert.doesNotMatch(context((await hook('prompt', prompt)) || '{}'), /changed/u, 'delivered once');
});

test('without the service the new session is told the state is unknown', async () => {
  assert.equal(context(await start('claude', { WFK_PORT: '1' })), 'Workflow Kit autopilot: unknown (service not reachable).');
});
