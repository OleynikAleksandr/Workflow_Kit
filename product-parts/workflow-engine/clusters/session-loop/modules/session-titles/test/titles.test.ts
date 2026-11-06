import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { DEFAULT_NAME, SESSIONS_DIR, TitleError, createSessionTitles } from '../src/index.ts';
import { CLAUDE_NEXT_NOTE } from '../src/titles.ts';
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
  await assert.rejects(titles.setTopic(folder, 'Тема'), code('no-running-turn'));
  active = [
    { key: 'claude:x', projectId: 'p', state: 'working' },
    { key: 'codex:y', projectId: 'p', state: 'working' },
  ];
  await assert.rejects(titles.setTopic(folder, 'Тема'), code('ambiguous'));
  active = [{ key: 'claude:a', projectId: 'p', state: 'working' }];
  await assert.rejects(titles.setTopic(folder, 'Ещё раз'), code('already-set'));
  await assert.rejects(titles.setTopic('/elsewhere', 'Тема'), code('project-not-found'));
  await assert.rejects(titles.setManual('p', 'claude:a', 'x'.repeat(81)), code('bad-title'));
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
  assert.deepEqual([titles.name('p', 'claude:hooked').synced, titles.name('p', 'claude:hooked').note], [false, CLAUDE_NEXT_NOTE]);
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
  assert.deepEqual([titles.name('p', 'claude:busy').synced, titles.name('p', 'claude:busy').note], [false, CLAUDE_NEXT_NOTE]);
  titles.onTurn('claude:busy');
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(renames, [], 'still in a turn');
  titles.onStop('claude:busy');
  for (let i = 0; i < 50 && titles.name('p', 'claude:busy').synced !== true; i += 1) await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(renames, [['claude:busy', 'Инвентаризация']]);
  active = [];
  await titles.setManual('p', 'claude:busy', 'Ревизия');
  assert.deepEqual(renames.at(-1), ['claude:busy', 'Ревизия'], 'an idle session is renamed at once');
});
