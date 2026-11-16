// M39 T005: the autopiloting settings (autopiloting.json in the configuration folder) and the
// run journal of a project (.workflow-kit/local/autopiloting/<runId>.json).
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { HttpError, createRouter, createStateRegistry } from '#http-server';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { RUNS_DIR, SETTINGS_FILE, SettingsError, createRunJournal, createSettingsStore, registerAutopilotingRoutes } from '../src/index.ts';
import type { NewRun, Runs } from '../src/index.ts';

const tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-autopiloting-'));
after(() => rm(tmp, { recursive: true, force: true }));
let n = 0;
const folder = async (): Promise<string> => {
  const dir = path.join(tmp, `d${(n += 1)}`);
  await mkdir(dir, { recursive: true });
  return dir;
};

test('a missing file reads as off without review; writes check the revision', async () => {
  const configDir = await folder();
  const store = createSettingsStore({ configDir });
  assert.deepEqual(await store.read(), { settings: { version: 1, revision: 0, mode: 'off', review: false }, error: null });
  const saved = await store.write({ expectedRevision: 0, mode: 'after-start', review: true });
  assert.deepEqual(saved, { version: 1, revision: 1, mode: 'after-start', review: true });
  assert.deepEqual(JSON.parse(await readFile(path.join(configDir, SETTINGS_FILE), 'utf8')), saved);
  await assert.rejects(store.write({ expectedRevision: 0, mode: 'full', review: false }), (error: unknown) => {
    assert.ok(error instanceof SettingsError);
    assert.equal(error.code, 'settings-stale');
    assert.equal(error.status, 409);
    assert.deepEqual(error.current, saved);
    return true;
  });
  for (const bad of [{ expectedRevision: 1, mode: 'on', review: true }, { expectedRevision: 1, mode: 'full', review: 'yes' }, { mode: 'full', review: true }, null]) {
    await assert.rejects(store.write(bad), { code: 'bad-request', status: 400 });
  }
  assert.equal((await store.read()).settings.revision, 1);
});

test('two writes with the same revision: one wins, the other is stale; listeners hear the change', async () => {
  const store = createSettingsStore({ configDir: await folder(), platform: 'win32' });
  const heard: string[] = [];
  store.onChange(({ before, after }) => void heard.push(`${before.mode}->${after.mode}`));
  const results = await Promise.allSettled([store.write({ expectedRevision: 0, mode: 'full', review: true }), store.write({ expectedRevision: 0, mode: 'after-start', review: false })]);
  assert.deepEqual(results.map((r) => r.status), ['fulfilled', 'rejected']);
  assert.deepEqual(heard, ['off->full']);
});

test('a broken or unknown file never turns the autopilot on and shows the error', async () => {
  for (const content of ['{not json', JSON.stringify({ version: 2, revision: 1, mode: 'full', review: true }), JSON.stringify({ version: 1, revision: 1, mode: 'always', review: true })]) {
    const configDir = await folder();
    await writeFile(path.join(configDir, SETTINGS_FILE), content);
    const view = await createSettingsStore({ configDir }).read();
    assert.equal(view.settings.mode, 'off');
    assert.ok(view.error, content);
  }
});

test('routes: GET and POST with 400/409, and the state section without quotes', async () => {
  const configDir = await folder();
  const settings = createSettingsStore({ configDir });
  const router = createRouter();
  const state = createStateRegistry();
  const runs = { section: async () => ({ projects: { p1: { runId: 'run-abcdef', mode: 'full', phase: 'preparing' } } }) } as unknown as Runs;
  registerAutopilotingRoutes({ router, state, settings, runs });
  const call = async (method: 'GET' | 'POST', body?: unknown) => {
    const match = router.match(method, '/api/settings/autopiloting');
    if (match.kind !== 'found') throw new Error('no route');
    try {
      return { status: 200, body: (await match.handler({ method, path: '/api/settings/autopiloting', query: new URLSearchParams(), params: match.params, body, req: {} as IncomingMessage, res: {} as ServerResponse })) as Record<string, unknown> };
    } catch (error) {
      if (error instanceof HttpError) return { status: error.status, body: { code: error.code, ...error.details } };
      throw error;
    }
  };
  assert.deepEqual(await call('GET'), { status: 200, body: { version: 1, revision: 0, mode: 'off', review: false, error: null } });
  assert.equal((await call('POST', { expectedRevision: 0, mode: 'full', review: true })).body['revision'], 1);
  assert.equal((await call('POST', { expectedRevision: 0, mode: 'off', review: true })).status, 409);
  assert.equal((await call('POST', { expectedRevision: 1, mode: 'x', review: true })).status, 400);
  const section = (await state.collect())['autopiloting'] as Record<string, unknown>;
  assert.deepEqual(section['settings'], { version: 1, revision: 1, mode: 'full', review: true });
  assert.equal(JSON.stringify(section).includes('quote'), false);
});

const sample = (projectId = 'p1'): NewRun => ({
  projectId,
  owner: { key: 'claude:s-1', client: 'claude', sessionId: 's-1' },
  mode: 'full',
  review: true,
  request: { source: 'user-command', quote: 'да, составляй', at: '2026-11-16T10:00:00.000Z', turnId: 't', goal: 'Docs' },
  proposal: null,
  scopeId: null,
  authority: null,
  phase: 'preparing',
  pausedFrom: null,
  reason: null,
  nextAction: null,
});

test('journal: a run is written, listed, active until final and updated with a new revision', async () => {
  const root = await folder();
  let clock = Date.parse('2026-11-16T10:00:00.000Z');
  const journal = createRunJournal({ now: () => new Date((clock += 1000)) });
  assert.deepEqual(await journal.list(root), []);
  assert.equal(await journal.active(root), null);
  const run = await journal.create(root, sample());
  assert.match(run.runId, /^run-/u);
  assert.equal(run.revision, 1);
  const file = path.join(root, ...RUNS_DIR.split('/'), `${run.runId}.json`);
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), run);
  assert.equal((await journal.active(root))?.runId, run.runId);
  const kept = await journal.update(root, run.runId, () => null);
  assert.equal(kept.revision, 1);
  const done = await journal.update(root, run.runId, (r) => ({ ...r, phase: 'completed' }));
  assert.equal(done.revision, 2);
  assert.equal(await journal.active(root), null);
  await writeFile(path.join(root, ...RUNS_DIR.split('/'), 'run-broken.json'), '{');
  assert.equal((await journal.list(root)).length, 1);
  await assert.rejects(journal.read(root, '../escape'), /invalid run id/u);
});

test('journal: the project lock is re-entrant within one chain and serializes the others', async () => {
  const root = await folder();
  const journal = createRunJournal();
  const order: string[] = [];
  const run = await journal.create(root, sample());
  const first = journal.locked(root, async () => {
    order.push('first:start');
    await journal.update(root, run.runId, (r) => ({ ...r, reason: 'inside' }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    order.push('first:end');
  });
  const second = journal.update(root, run.runId, (r) => (order.push('second'), { ...r, reason: 'after' }));
  await Promise.all([first, second]);
  assert.deepEqual(order, ['first:start', 'first:end', 'second']);
  assert.equal((await journal.read(root, run.runId))?.reason, 'after');
});
