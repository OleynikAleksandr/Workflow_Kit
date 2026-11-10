import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { HttpError } from '#http-server';
import { DEFAULT_NAME, NEXT_TURN_NOTE, SESSIONS_DIR, TitleError, createSessionTitles, namedSession } from '../src/index.ts';
import type { ActiveSession, SessionTitlesOptions } from '../src/index.ts';

let tmp = '';
let folder = '';
let active: ActiveSession[] = [];
let scope: { objective: string; ownerSession: string | null } | null = null;
let renames: Array<[string, string]> = [];
let loaded = false;

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-titles-'));
  folder = path.join(tmp, 'demo');
  await mkdir(folder);
});
after(async () => {
  await rm(tmp, { recursive: true, force: true });
});

const options = (): SessionTitlesOptions => ({
  listProjects: async () => [{ id: 'p', path: folder }],
  resolveProject: async (f) => (f.startsWith(folder) ? { id: 'p' } : undefined),
  sessions: () => active,
  scope: () => scope,
  // Like the registry: only Claude takes a name from the prompt hook answer.
  promptTitle: (client) => client === 'claude',
  rename: async (_id, key, name) => {
    renames.push([key, name]);
    return loaded ? { synced: true } : { synced: false, note: 'later' };
  },
});

test('priority: manual → agent topic → plan objective → provider name → default', async () => {
  const titles = createSessionTitles(options());
  assert.deepEqual([titles.name('p', 'claude:a').name, titles.name('p', 'claude:a').source], [DEFAULT_NAME, 'default']);
  assert.equal(titles.name('p', 'claude:a', 'Имя из Claude').source, 'provider');
  scope = { objective: 'Склад — анализ остатков', ownerSession: 'a' };
  assert.deepEqual([titles.name('p', 'claude:a').name, titles.name('p', 'claude:a').source], ['Склад — анализ остатков', 'scope']);
  assert.equal(titles.name('p', 'claude:b').source, 'default', 'the objective names only the owner session');

  active = [{ key: 'claude:a', projectId: 'p', state: 'working' }];
  const topic = await titles.setTopic(path.join(folder, 'src'), '  Анализ   остатков  ');
  assert.equal(topic.key, 'claude:a');
  assert.deepEqual([topic.title.name, topic.title.source], ['Анализ остатков', 'agent']);
  await titles.setManual('p', 'claude:a', 'Моё имя');
  assert.deepEqual([titles.name('p', 'claude:a').name, titles.name('p', 'claude:a').source], ['Моё имя', 'manual']);
  await titles.setManual('p', 'claude:a', '');
  assert.equal(titles.name('p', 'claude:a').source, 'agent');
  assert.deepEqual(renames, [], 'Claude names stay in Workflow Kit');
  scope = null;
});

test('the topic is set once, only for the single session with a running turn', async () => {
  const titles = createSessionTitles(options());
  await titles.load();
  const code = (expected: string) => (error: unknown) => error instanceof TitleError && error.code === expected;
  active = [];
  await assert.rejects(titles.setTopic(folder, 'Тема'), code('session-ambiguous'));
  active = [
    { key: 'claude:x', projectId: 'p', state: 'working' },
    { key: 'codex:y', projectId: 'p', state: 'working' },
  ];
  await assert.rejects(titles.setTopic(folder, 'Тема'), code('session-ambiguous'));
  active = [{ key: 'claude:a', projectId: 'p', state: 'working' }];
  await assert.rejects(titles.setTopic(folder, 'Ещё раз'), code('already-set'));
  await assert.rejects(titles.setTopic('/elsewhere', 'Тема'), code('project-not-found'));
  await assert.rejects(titles.setManual('p', 'claude:a', 'x'.repeat(81)), code('bad-title'));
});

test('none or several running turns: session-ambiguous with the candidates, never a guess (M8 5)', async () => {
  const titles = createSessionTitles({ ...options(), rename: undefined });
  const refusal = async (): Promise<TitleError> => {
    try {
      await titles.running('p');
    } catch (error) {
      if (error instanceof TitleError) return error;
    }
    throw new Error('expected a TitleError');
  };
  active = [
    { key: 'kimi:session_k1', projectId: 'p', state: 'waiting' },
    { key: 'codex:idle', projectId: 'p', state: 'waiting' },
    { key: 'claude:other', projectId: 'q', state: 'working' },
  ];
  const none = await refusal();
  assert.deepEqual([none.code, none.status], ['session-ambiguous', 409]);
  assert.match(none.message, /Не найдена сессия проекта с идущим ходом: повторите команду с --client <id> --session <id>/);
  assert.deepEqual(none.details, { candidates: [
    { client: 'kimi', session: 'session_k1', state: 'waiting', name: DEFAULT_NAME },
    { client: 'codex', session: 'idle', state: 'waiting', name: DEFAULT_NAME },
  ] }, 'no turn runs: every session of the project is a candidate');
  active = [
    { key: 'kimi:session_k1', projectId: 'p', state: 'working' },
    { key: 'codex:busy', projectId: 'p', state: 'working' },
    { key: 'codex:idle', projectId: 'p', state: 'waiting' },
  ];
  const several = await refusal();
  assert.match(several.message, /идут ходы нескольких сессий \(2\)/);
  assert.deepEqual((several.details!['candidates'] as Array<{ session: string }>).map((c) => c.session), ['session_k1', 'busy'], 'only the running ones');
  active = [{ key: 'kimi:session_k1', projectId: 'p', state: 'working' }, { key: 'codex:idle', projectId: 'p', state: 'waiting' }];
  assert.equal(await titles.running('p'), 'kimi:session_k1');
  assert.equal((await titles.setTopic(folder, 'Тема Kimi')).key, 'kimi:session_k1', 'a session of any registered provider gets its topic');
  active = [];
});

test('no hook reached the service: the only session the providers list as running is used (M9 2.3)', async () => {
  let busy: string[] = [];
  const titles = createSessionTitles({ ...options(), rename: undefined, listedRunning: async (id) => new Set(id === 'p' ? busy : []) });
  active = [{ key: 'kimi:session_old', projectId: 'p', state: 'waiting' }];
  busy = ['kimi:session_live'];
  assert.equal(await titles.running('p'), 'kimi:session_live');
  assert.equal((await titles.setTopic(folder, 'Склад')).key, 'kimi:session_live');

  busy = ['kimi:session_a', 'kimi:session_b'];
  const several = await titles.running('p').then(() => null, (error: unknown) => error as TitleError);
  assert.equal(several?.code, 'session-ambiguous');
  assert.deepEqual((several?.details!['candidates'] as Array<{ session: string }>).map((c) => c.session), ['session_a', 'session_b']);

  busy = [];
  const none = await titles.running('p').then(() => null, (error: unknown) => error as TitleError);
  assert.match(none?.message ?? '', /Не найдена сессия проекта с идущим ходом/);
  // A turn the channel knows wins over the lists.
  active = [{ key: 'codex:thread', projectId: 'p', state: 'working' }];
  busy = ['kimi:session_live'];
  assert.equal(await titles.running('p'), 'codex:thread');
  active = [];
});

test('a request names its session by a registered client and an id, or names none', () => {
  const isClient = (client: string): boolean => ['claude', 'codex', 'kimi'].includes(client);
  const bad = (error: unknown): boolean => error instanceof HttpError && error.status === 400 && error.code === 'bad-session';
  assert.equal(namedSession({}, isClient), null);
  assert.equal(namedSession({ client: '', sessionId: '' }, isClient), null);
  assert.deepEqual(namedSession({ client: 'kimi', sessionId: 'session_k1' }, isClient), { client: 'kimi', id: 'session_k1' });
  assert.throws(() => namedSession({ client: 'gemini', sessionId: 'g1' }, isClient), bad);
  assert.throws(() => namedSession({ client: 'kimi' }, isClient), bad, 'a client without an id is not a guess');
  assert.throws(() => namedSession({ sessionId: 'x' }, isClient), bad);
  assert.deepEqual(namedSession({ client: 'gemini', sessionId: 'g1' }), { client: 'gemini', id: 'g1' }, 'without a registry any id-shaped client');
  assert.throws(() => namedSession({ client: 'Bad Client', sessionId: 'g1' }), bad);
});

test('the calling session gets the topic by its id; helper threads do not make the choice ambiguous', async () => {
  const titles = createSessionTitles({ ...options(), listed: async () => new Set(['codex:thread']), rename: undefined });
  const code = (expected: string) => (error: unknown) => error instanceof TitleError && error.code === expected;
  // Codex Desktop's hidden helper fork also sent a prompt hook and looks like a running turn.
  active = [
    { key: 'codex:thread', projectId: 'p', state: 'working' },
    { key: 'codex:helper', projectId: 'p', state: 'working' },
  ];
  const byList = await titles.setTopic(folder, 'Склад: анализ остатков');
  assert.equal(byList.key, 'codex:thread');
  const byId = await titles.setTopic(folder, 'Закупки', { client: 'claude', id: 'own-id' });
  assert.equal(byId.key, 'claude:own-id', 'the id from the environment wins even without a running turn');
  await assert.rejects(titles.setTopic(folder, 'Тема', { client: 'claude', id: 'bad id' }), code('bad-session'));
  await assert.rejects(titles.setTopic(folder, 'Ещё', { client: 'claude', id: 'own-id' }), code('already-set'));
  active = [];
});

test('Codex names go to ChatGPT; a rename that had to wait is retried when a turn starts', async () => {
  renames = [];
  loaded = false;
  const titles = createSessionTitles(options());
  active = [{ key: 'codex:t1', projectId: 'p', state: 'working' }];
  await titles.setTopic(folder, 'Закупки');
  assert.deepEqual(renames, [['codex:t1', 'Закупки']]);
  assert.equal(titles.name('p', 'codex:t1').synced, false);
  loaded = true;
  titles.onTurn('codex:t1');
  for (let i = 0; i < 50 && titles.name('p', 'codex:t1').synced !== true; i += 1) await new Promise((r) => setTimeout(r, 10));
  assert.equal(titles.name('p', 'codex:t1').synced, true);
  const file = JSON.parse(await readFile(path.join(folder, SESSIONS_DIR, 'codex.t1.json'), 'utf8'));
  assert.deepEqual(file, { title: null, topic: 'Закупки', synced: true, archivedAt: null, forgottenAt: null });

  const restarted = createSessionTitles(options());
  await restarted.load();
  assert.deepEqual(restarted.section().projects['p']?.['codex:t1']?.name, 'Закупки');
});

test('a Codex name that did not reach ChatGPT is sent again when the service starts', async () => {
  renames = [];
  loaded = false;
  const titles = createSessionTitles(options());
  await titles.load();
  renames = [];
  await titles.setManual('p', 'codex:t9', 'Отгрузки');
  assert.equal(titles.name('p', 'codex:t9').synced, false);
  renames = [];
  loaded = true;
  const restarted = createSessionTitles(options());
  await restarted.load();
  for (let i = 0; i < 50 && restarted.name('p', 'codex:t9').synced !== true; i += 1) await new Promise((r) => setTimeout(r, 10));
  assert.equal(restarted.name('p', 'codex:t9').synced, true);
  assert.ok(renames.some(([key, name]) => key === 'codex:t9' && name === 'Отгрузки'));
  assert.ok(!renames.some(([key]) => key === 'codex:t1'), 'a synced name is not sent again');
});

test('a session goes into the archive and back; the flag survives a reload and keeps the name', async () => {
  const titles = createSessionTitles({ ...options(), now: () => new Date('2026-11-06T09:00:00Z') });
  await titles.setManual('p', 'claude:arch', 'Старая сессия');
  const archived = await titles.setArchived('p', 'claude:arch', true);
  assert.equal(archived.archivedAt, '2026-11-06T09:00:00.000Z');
  assert.equal(archived.name, 'Старая сессия');
  const file = JSON.parse(await readFile(path.join(folder, SESSIONS_DIR, 'claude.arch.json'), 'utf8')) as Record<string, unknown>;
  assert.equal(file['archivedAt'], '2026-11-06T09:00:00.000Z');
  const reloaded = createSessionTitles(options());
  await reloaded.load();
  assert.equal(reloaded.section().projects['p']?.['claude:arch']?.archivedAt, '2026-11-06T09:00:00.000Z');
  assert.equal((await reloaded.setArchived('p', 'claude:arch', false)).archivedAt, null);
  assert.equal(reloaded.name('p', 'claude:arch').name, 'Старая сессия');
  await assert.rejects(titles.setArchived('p', 'bad key', true), (error: unknown) => error instanceof TitleError && error.code === 'bad-session');
});

test('the archive of a session reaches the provider; a provider failure is logged, the flag stays', async () => {
  const heard: Array<[string, string, boolean]> = [];
  const lines: string[] = [];
  const titles = createSessionTitles({
    ...options(),
    log: (line) => void lines.push(line),
    archived: async (projectId, key, archived) => {
      heard.push([projectId, key, archived]);
      if (key === 'claude:fails') throw new Error('process did not stop');
    },
  });
  await titles.setArchived('p', 'claude:ok', true);
  await titles.setArchived('p', 'claude:ok', false);
  assert.ok((await titles.setArchived('p', 'claude:fails', true)).archivedAt);
  assert.deepEqual(heard, [['p', 'claude:ok', true], ['p', 'claude:ok', false], ['p', 'claude:fails', true]]);
  assert.match(lines.join('\n'), /claude:fails archive in the provider failed: process did not stop/);
});

test('a session removed from the lists stays removed after a reload', async () => {
  const titles = createSessionTitles({ ...options(), now: () => new Date('2026-11-06T10:00:00Z') });
  await titles.setArchived('p', 'codex:gone', true);
  assert.equal((await titles.setForgotten('p', 'codex:gone')).forgottenAt, '2026-11-06T10:00:00.000Z');
  const reloaded = createSessionTitles(options());
  await reloaded.load();
  assert.equal(reloaded.section().projects['p']?.['codex:gone']?.forgottenAt, '2026-11-06T10:00:00.000Z');
  await assert.rejects(titles.setForgotten('p', '../x'), (error: unknown) => error instanceof TitleError && error.code === 'bad-session');
});

test('a Claude name goes to the app through the prompt hook once per name; a matching title marks it synced', async () => {
  const titles = createSessionTitles({ ...options(), rename: undefined });
  await titles.load();
  assert.equal(await titles.appTitle('claude:hooked', 'Старое'), null, 'no Kit name, nothing to send');
  await titles.setManual('p', 'claude:hooked', 'Склад — остатки');
  assert.deepEqual([titles.name('p', 'claude:hooked').synced, titles.name('p', 'claude:hooked').note], [false, NEXT_TURN_NOTE]);
  assert.equal(await titles.appTitle('claude:hooked', 'Старое'), 'Склад — остатки');
  assert.equal(await titles.appTitle('claude:hooked', 'Старое'), null, 'sent once: a rename in the app is not overridden');
  assert.equal(await titles.appTitle('claude:hooked', 'Склад — остатки'), null);
  assert.deepEqual([titles.name('p', 'claude:hooked').synced, titles.name('p', 'claude:hooked').note], [true, null]);
  await titles.setManual('p', 'claude:hooked', 'Склад');
  assert.equal(await titles.appTitle('claude:hooked', 'Склад — остатки'), 'Склад', 'a new name is sent again');
  await titles.setManual('p', 'codex:hooked', 'Codex');
  assert.equal(await titles.appTitle('codex:hooked', null), null, 'Codex names go through the daemon');
});

test('a Claude name is typed into the session only outside a turn; during a turn it waits for Stop', async () => {
  renames = [];
  loaded = true;
  const titles = createSessionTitles(options());
  active = [{ key: 'claude:busy', projectId: 'p', state: 'working' }];
  await titles.setTopic(folder, 'Инвентаризация', { client: 'claude', id: 'busy' });
  assert.deepEqual(renames, [], 'no keys during a turn');
  assert.deepEqual([titles.name('p', 'claude:busy').synced, titles.name('p', 'claude:busy').note], [false, NEXT_TURN_NOTE]);
  titles.onTurn('claude:busy');
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(renames, [], 'still in a turn');
  await titles.onStop('claude:busy');
  assert.deepEqual([renames, titles.name('p', 'claude:busy').synced], [[['claude:busy', 'Инвентаризация']], true], 'onStop resolves with the name applied');
  active = [];
  await titles.setManual('p', 'claude:busy', 'Ревизия');
  assert.deepEqual(renames.at(-1), ['claude:busy', 'Ревизия'], 'an idle session is renamed at once');
});

test('a name the provider refused during a turn is applied at the end of the turn, before onStop resolves', async () => {
  renames = [];
  loaded = false;
  const titles = createSessionTitles(options());
  await titles.setManual('p', 'kimi:busy', 'Отчёт по складу');
  assert.deepEqual([renames.length, titles.name('p', 'kimi:busy').synced, titles.name('p', 'kimi:busy').note], [1, false, 'later']);
  loaded = true;
  await titles.onStop('kimi:busy');
  assert.deepEqual([renames.length, titles.name('p', 'kimi:busy').synced, titles.name('p', 'kimi:busy').note], [2, true, null]);
  await titles.onStop('kimi:busy');
  assert.equal(renames.length, 2, 'nothing waits any more');
});

test('no topic during the service greeting turn; the next turn with a task sets it', async () => {
  const titles = createSessionTitles({ ...options(), rename: undefined });
  active = [{ key: 'codex:greet', projectId: 'p', state: 'working' }];
  titles.setServiceTurn('codex:greet', true);
  await assert.rejects(titles.setTopic(folder, 'Подготовка проекта', { client: 'codex', id: 'greet' }), (error: unknown) => error instanceof TitleError && error.code === 'service-turn');
  titles.setServiceTurn('codex:greet', false);
  const set = await titles.setTopic(folder, 'Склад: анализ остатков', { client: 'codex', id: 'greet' });
  assert.equal(set.title.name, 'Склад: анализ остатков');
  active = [];
});
