// M48 T001: the autopiloting of a session. A session takes the Settings of the moment it begins
// and keeps them; the owner of the project's active run takes the run's mode and review (an update
// from an older version); the decision points read the session, not Settings; the card writes with
// a revision; the file name has no character Windows refuses.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { createRouter, createStateRegistry } from '#http-server';
import type { TurnUserSource } from '#agent-channel';
import { SUPPORTED_HOST_PROTOCOL } from '#plan-view';
import { SESSION_SETTINGS_DIR, SettingsError, createHostTickets, createRunJournal, createRuns, createSessionSettings, createSettingsStore, registerAutopilotingRoutes, sessionSettingsName, validSessionKey } from '../src/index.ts';
import type { NewRun, RunKit, RunKitStatus, SessionSettingsChange } from '../src/index.ts';

const tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-m48-sessions-'));
after(() => rm(tmp, { recursive: true, force: true }));
const CAPABILITY = { authorization: true, automation: true, complete: true, deferDelivery: true, hostProtocol: SUPPORTED_HOST_PROTOCOL, instructions: true };
const KEY = 'claude:s-1';
let n = 0;

async function setup(platform?: NodeJS.Platform) {
  const dir = path.join(tmp, `p${(n += 1)}`);
  await mkdir(path.join(dir, 'config'), { recursive: true });
  const settings = createSettingsStore({ configDir: path.join(dir, 'config') });
  const journal = createRunJournal();
  const projectPath = async (id: string) => (id === 'p1' ? dir : undefined);
  const sessions = createSessionSettings({ settings, journal, projectPath, ...(platform ? { platform } : {}) });
  const changes: SessionSettingsChange[] = [];
  sessions.onChange((change) => void changes.push(change));
  const sources = new Map<string, TurnUserSource | null>();
  const kit = {
    status: async () => ({ revision: 3, head: 'abc', capability: CAPABILITY, proposal: null, authorization: null, acceptance: null }) as unknown as RunKitStatus,
    supported: () => ({ ready: true }),
    scope: async () => null,
    host: async () => assert.fail('no host step expected'),
  } as unknown as RunKit;
  const runs = createRuns({
    settings, sessions, journal, kit, tickets: createHostTickets(),
    userSource: (key) => sources.get(key) ?? null,
    projectPath,
    listProjects: async () => [{ id: 'p1', path: dir }],
  });
  const say = (key: string, text: string) => sources.set(key, { id: `m-${key}`, text, at: '2026-11-20T10:00:00.000Z', via: 'prompt', turnRef: `g-${key}` });
  const setSettings = async (mode: 'off' | 'after-start' | 'full', review: boolean) => {
    const current = (await settings.read()).settings;
    await settings.write({ expectedRevision: current.revision, mode, review });
  };
  return { dir, settings, journal, sessions, changes, runs, say, setSettings };
}

const newRun = (over: Partial<NewRun> = {}): NewRun => ({
  projectId: 'p1', owner: { key: KEY, client: 'claude', sessionId: 's-1' }, mode: 'full', review: true,
  request: { source: 'user-command', quote: 'да', at: '2026-11-20T10:00:00.000Z', turnId: null, goal: 'g' },
  proposal: null, scopeId: null, authority: null, phase: 'preparing', pausedFrom: null, reason: null, nextAction: null, ...over,
});

test('the file name of a session has no character Windows refuses; only <client>:<id> keys are taken', () => {
  assert.equal(sessionSettingsName('claude:0b7c-11'), 'claude.0b7c-11.json');
  assert.equal(sessionSettingsName('kimi:a:b c'), 'kimi.a_b_c.json');
  for (const key of ['claude:0b7c-11', 'codex:019a.x', 'kimi:a:b c']) assert.doesNotMatch(sessionSettingsName(key), /[<>:"/\\|?*\s]/u);
  assert.equal(validSessionKey('codex:019a3d4e-5f60'), true);
  for (const bad of ['claude', 'claude:', 'Claude:x', 'claude:../x', 'claude:a\\b', 'claude:a b']) assert.equal(validSessionKey(bad), false, bad);
});

test('a session takes the Settings of the moment it begins and keeps them; a new session takes the new ones', async () => {
  const t = await setup();
  await t.setSettings('full', true);
  const first = await t.sessions.ensure('p1', KEY);
  assert.deepEqual([first.mode, first.review, first.source, first.revision], ['full', true, 'defaults', 0]);
  await t.setSettings('off', false);
  const again = await t.sessions.ensure('p1', KEY);
  assert.deepEqual([again.mode, again.review, again.at], ['full', true, first.at], 'a resume or a later read keeps the record');
  const other = await t.sessions.ensure('p1', 'codex:s-2');
  assert.deepEqual([other.mode, other.review], ['off', false]);
  assert.deepEqual((await readdir(path.join(t.dir, ...SESSION_SETTINGS_DIR.split('/')))).sort(), ['claude.s-1.json', 'codex.s-2.json']);
  assert.deepEqual(Object.keys(t.sessions.section()['p1'] ?? {}).sort(), [KEY, 'codex:s-2']);
  assert.equal(t.changes.length, 0, 'taking the defaults is no change of the user');
});

test('an update from an older version: the owner of the active run takes its mode and review', async () => {
  const t = await setup();
  await t.journal.create(t.dir, newRun({ mode: 'full', review: true }));
  const owner = await t.sessions.ensure('p1', KEY);
  assert.deepEqual([owner.mode, owner.review, owner.source], ['full', true, 'run']);
  const stranger = await t.sessions.ensure('p1', 'codex:s-2');
  assert.deepEqual([stranger.mode, stranger.review, stranger.source], ['off', false, 'defaults']);
});

test('the card writes with the revision: stale, bad values and an unknown project are refused; the change is heard', async () => {
  const t = await setup('win32');
  const record = await t.sessions.ensure('p1', KEY);
  const written = await t.sessions.write('p1', KEY, { expectedRevision: record.revision, mode: 'full' });
  assert.deepEqual([written.mode, written.review, written.source, written.revision], ['full', false, 'user', 1]);
  await assert.rejects(t.sessions.write('p1', KEY, { expectedRevision: 0, review: true }), (error: { code: string; status: number; current: { revision: number } }) => error.code === 'settings-stale' && error.status === 409 && error.current.revision === 1);
  await assert.rejects(t.sessions.write('p1', KEY, { expectedRevision: 1, mode: 'auto' }), { code: 'bad-request' });
  await assert.rejects(t.sessions.write('p1', KEY, { expectedRevision: 1 }), { code: 'bad-request' });
  await assert.rejects(t.sessions.write('p2', KEY, { expectedRevision: 0, mode: 'off' }), { code: 'project-not-found', status: 404 });
  const review = await t.sessions.write('p1', KEY, { expectedRevision: 1, review: true });
  assert.deepEqual([review.mode, review.review], ['full', true]);
  assert.deepEqual(t.changes.map((c) => [c.key, c.before.mode, c.after.mode, c.after.review]), [[KEY, 'off', 'full', false], [KEY, 'full', 'full', true]]);
  // A service restart reads the records back for the panel.
  const fresh = createSessionSettings({ settings: t.settings, journal: t.journal, projectPath: async () => t.dir });
  await fresh.load([{ id: 'p1', path: t.dir }]);
  assert.deepEqual([fresh.section()['p1']?.[KEY]?.revision, fresh.section()['p1']?.[KEY]?.review], [2, true]);
});

test('the decision points read the session: Settings changed later do not reach a session that has begun', async () => {
  const t = await setup();
  await t.setSettings('after-start', false);
  await t.sessions.ensure('p1', KEY);
  await t.setSettings('full', true);
  t.say(KEY, 'Сделай учёт склада');
  assert.equal(await t.runs.authorizePreparation('p1', KEY, 'Docs'), null, 'the session is after-start: the plan question');
  assert.equal(await t.runs.planDecision('p1', KEY, 'plan', 'Docs'), null);
  assert.equal((await t.runs.policy('p1', KEY)).mode, 'after-start');
  assert.equal((await t.runs.policy('p1')).mode, 'full', 'without a session the policy is of Settings');
  // A new session of the same project takes the full mode of Settings and gets a run at once.
  t.say('codex:s-2', 'Сделай учёт склада');
  const prepared = await t.runs.authorizePreparation('p1', 'codex:s-2', 'Docs');
  assert.deepEqual([prepared?.action, prepared?.review], ['prepare', true]);
  // The card of the first session switches it to full: its next question is answered by a run.
  const own = await t.sessions.ensure('p1', KEY);
  await t.sessions.write('p1', KEY, { expectedRevision: own.revision, mode: 'full', review: false });
  await assert.rejects(t.runs.authorizePreparation('p1', KEY, 'Docs'), { code: 'run-active' }, 'one run per project: the other session holds it');
});

test('GET and POST /api/projects/:id/sessions/:sid/autopiloting and the sessions part of the state', async () => {
  const t = await setup();
  await t.setSettings('full', false);
  const router = createRouter();
  const state = createStateRegistry();
  registerAutopilotingRoutes({ router, state, settings: t.settings, runs: t.runs, sessions: t.sessions });
  type Found = { handler(input: unknown): Promise<unknown>; params: Record<string, string> };
  // The router gets the decoded path: the key keeps its colon.
  const call = (method: 'GET' | 'POST', url: string, body?: unknown): Promise<unknown> => {
    const route = router.match(method, url) as unknown as Found & { kind: string };
    assert.equal(route.kind, 'found', `${method} ${url}`);
    return route.handler({ params: route.params, body, query: new URLSearchParams() });
  };
  const url = `/api/projects/p1/sessions/${KEY}/autopiloting`;
  const read = (await call('GET', url)) as { settings: { mode: string; revision: number } };
  assert.deepEqual([read.settings.mode, read.settings.revision], ['full', 0]);
  const written = (await call('POST', url, { expectedRevision: 0, mode: 'off' })) as { settings: { mode: string } };
  assert.equal(written.settings.mode, 'off');
  await assert.rejects(call('POST', url, { expectedRevision: 0, mode: 'full' }), { status: 409, code: 'settings-stale' });
  await assert.rejects(call('GET', '/api/projects/p1/sessions/claude/autopiloting'), { status: 400 });
  await assert.rejects(call('GET', `/api/projects/p9/sessions/${KEY}/autopiloting`), { status: 404 });
  const section = (await state.collect())['autopiloting'] as { sessions: Record<string, Record<string, { mode: string }>> };
  assert.equal(section.sessions['p1']?.[KEY]?.mode, 'off');
});

test('T003: a decided review wins over the Settings default; syncReview follows it without the listeners', async () => {
  const t = await setup();
  await t.setSettings('full', true);
  const decided = createSessionSettings({ settings: t.settings, journal: t.journal, projectPath: async () => t.dir, reviewOf: (_id, key) => (key === 'codex:s-2' ? false : null) });
  assert.equal((await decided.ensure('p1', 'codex:s-2')).review, false);
  assert.equal((await decided.ensure('p1', 'codex:s-3')).review, true);
  const record = await t.sessions.ensure('p1', KEY);
  await t.sessions.syncReview('p1', KEY, false);
  const synced = (await t.sessions.get('p1', KEY))!;
  assert.deepEqual([synced.review, synced.revision, synced.source], [false, record.revision + 1, 'user']);
  await t.sessions.syncReview('p1', KEY, false);
  assert.equal((await t.sessions.get('p1', KEY))?.revision, record.revision + 1, 'the same value writes nothing');
  assert.equal(t.changes.length, 0, 'no listener: the decision is already applied');
});

test('T003: the card checks a review change first; an unchanged review is not checked; the view tells the review state', async () => {
  const t = await setup();
  const router = createRouter();
  const guarded: boolean[] = [];
  let refuse = false;
  registerAutopilotingRoutes({
    router, state: createStateRegistry(), settings: t.settings, runs: t.runs, sessions: t.sessions,
    review: {
      state: () => 'reviewed',
      guard: async (_id, _key, on) => {
        guarded.push(on);
        if (refuse) throw new SettingsError('review-locked', 'Этот план уже прошёл ревью: решение о ревью не меняется');
      },
    },
  });
  const call = (method: 'GET' | 'POST', body?: unknown): Promise<unknown> => {
    const route = router.match(method, `/api/projects/p1/sessions/${KEY}/autopiloting`) as unknown as { handler(input: unknown): Promise<unknown>; params: Record<string, string> };
    return route.handler({ params: route.params, body, query: new URLSearchParams() });
  };
  const read = (await call('GET')) as { reviewState: string; settings: { review: boolean } };
  assert.deepEqual([read.reviewState, read.settings.review], ['reviewed', false]);
  await call('POST', { expectedRevision: 0, mode: 'full', review: false });
  assert.deepEqual(guarded, [], 'the review did not change');
  refuse = true;
  await assert.rejects(call('POST', { expectedRevision: 1, review: true }), { status: 409, code: 'review-locked' });
  assert.equal((await t.sessions.get('p1', KEY))?.review, false, 'a refused change writes nothing');
});
