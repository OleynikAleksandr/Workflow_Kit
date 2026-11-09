import assert from 'node:assert/strict';
import { appendFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { recordSessionStart } from '#kit-structure';
import {
  ProviderError,
  createStubProvider,
  createTokenStore,
  hookJournalFile,
  hookSessionInfo,
  isHelperFork,
  parseHookJournal,
  readHookSessions,
} from '../src/index.ts';

let tmp = '';

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-hooks-'));
});

after(async () => {
  await rm(tmp, { recursive: true, force: true });
});

function line(fields: Record<string, unknown>): string {
  return `${JSON.stringify({ transcript_path: null, cwd: null, source: 'startup', model: null, permission_mode: null, service: null, ...fields })}\n`;
}

test('parseHookJournal merges lines of one session and tolerates garbage', () => {
  const sessions = parseHookJournal(
    [
      line({ time: '2026-11-05T10:00:00.000Z', client: 'claude', session_id: 'a', model: 'opus', cwd: '/p' }),
      'not json\n',
      '[1,2]\n',
      line({ time: '2026-11-05T10:05:00.000Z', client: 'claude', session_id: 'a', source: 'resume', model: 'sonnet' }),
      line({ time: '2026-11-05T11:00:00.000Z', client: 'claude', session_id: null }),
      line({ time: '2026-11-05T12:00:00.000Z', client: 'codex', session_id: 'b', extra: { anything: true } }),
    ].join(''),
  );
  assert.deepEqual(
    sessions.map((s) => [s.client, s.sessionId]),
    [
      ['codex', 'b'],
      ['claude', 'a'],
    ],
  );
  const a = sessions[1]!;
  assert.equal(a.firstSeen, '2026-11-05T10:00:00.000Z');
  assert.equal(a.lastSeen, '2026-11-05T10:05:00.000Z');
  assert.equal(a.model, 'sonnet');
  assert.equal(a.cwd, '/p');
  assert.deepEqual(a.sources, ['startup', 'resume']);
});

test('readHookSessions reads the journal written by the hook, per client, without service sessions', async () => {
  const project = path.join(tmp, 'proj');
  await mkdir(path.join(project, '.workflow-kit'), { recursive: true });
  await writeFile(path.join(project, '.workflow-kit', 'manifest.json'), '{}');
  assert.deepEqual(await readHookSessions({ path: project }, 'claude'), []);
  const hook = (client: string, id: string, env: Record<string, string> = {}): Promise<unknown> =>
    recordSessionStart({ client, stdin: JSON.stringify({ session_id: id, cwd: project, source: 'startup' }), env, cwd: project });
  await hook('claude', 'desktop-1');
  await hook('codex', 'thread-1');
  await hook('claude', 'trust-dialog', { WFK_SERVICE_SESSION: 'trust' });
  const claude = await readHookSessions({ path: project }, 'claude');
  assert.deepEqual(claude.map((s) => s.sessionId), ['desktop-1']);
  assert.deepEqual((await readHookSessions({ path: project }, 'claude', { includeService: true })).map((s) => s.sessionId).sort(), [
    'desktop-1',
    'trust-dialog',
  ]);
  assert.deepEqual((await readHookSessions({ path: project }, 'codex')).map((s) => s.sessionId), ['thread-1']);

  // The cache follows the file: a new line is seen on the next read.
  await new Promise((resolve) => setTimeout(resolve, 5));
  await hook('claude', 'desktop-2');
  assert.equal((await readHookSessions({ path: project }, 'claude')).length, 2);

  const info = hookSessionInfo('claude', claude[0]!);
  assert.equal(info.origin, 'hook');
  assert.equal(info.state, 'unknown');
  assert.equal(info.localId, 'desktop-1');
  assert.equal(info.cwd, project);
  assert.deepEqual(info.links, {});
});

test('readHookSessions leaves out the hidden helper fork of Codex Desktop', async () => {
  const project = path.join(tmp, 'fork');
  const file = hookJournalFile(project);
  await mkdir(path.dirname(file), { recursive: true });
  const rollout = '/home/u/.codex/sessions/rollout-1.jsonl';
  await writeFile(
    file,
    [
      line({ time: '2026-11-06T12:38:03.000Z', client: 'codex', session_id: 'thread', source: 'startup', transcript_path: rollout }),
      line({ time: '2026-11-06T12:39:20.000Z', client: 'codex', session_id: 'helper', source: 'fork', transcript_path: null }),
      line({ time: '2026-11-06T12:40:27.000Z', client: 'codex', session_id: 'thread', source: 'resume', transcript_path: rollout }),
      line({ time: '2026-11-06T12:41:00.000Z', client: 'codex', session_id: 'user-fork', source: 'fork', transcript_path: '/home/u/.codex/sessions/rollout-2.jsonl' }),
    ].join(''),
  );
  assert.deepEqual((await readHookSessions({ path: project }, 'codex')).map((s) => s.sessionId), ['user-fork', 'thread']);
  assert.equal(isHelperFork({ sources: ['fork'], transcriptPath: null }), true);
  assert.equal(isHelperFork({ sources: ['startup'], transcriptPath: null }), false);
  assert.equal(isHelperFork({ sources: ['fork', 'resume'], transcriptPath: null }), false);
});

test('readHookSessions reads only the tail of a large journal', async () => {
  const project = path.join(tmp, 'big');
  const file = hookJournalFile(project);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, line({ time: '2026-01-01T00:00:00.000Z', client: 'claude', session_id: 'old', cwd: 'x'.repeat(500) }));
  await appendFile(file, line({ time: '2026-01-02T00:00:00.000Z', client: 'claude', session_id: 'new' }));
  const tail = await readHookSessions({ path: project }, 'claude', { maxBytes: 300 });
  assert.deepEqual(tail.map((s) => s.sessionId), ['new']);
});

test('stub provider: not implemented, actions refused with 501, sessions from the journal', async () => {
  const project = path.join(tmp, 'proj');
  const stub = createStubProvider({ id: 'claude', title: 'Claude', task: 'T006' });
  const status = await stub.status();
  assert.equal(status.implemented, false);
  assert.equal(status.state, 'not-implemented');
  assert.equal(status.label, 'не реализовано');
  assert.equal((await stub.capabilities())['createSession']?.available, false);
  assert.deepEqual(await stub.actions(null), []);
  const fakeProject = { id: 'p', name: 'proj', path: project, source: 'opened' as const, createdAt: '' };
  assert.deepEqual((await stub.hooks(fakeProject)).hooks, []);
  await assert.rejects(stub.previewTrust(fakeProject), (error: unknown) => error instanceof ProviderError && error.status === 501 && error.code === 'not-implemented');
  const sessions = await stub.listSessions(fakeProject);
  assert.deepEqual(sessions.map((s) => s.localId).sort(), ['desktop-1', 'desktop-2']);
  assert.match(sessions[0]!.note ?? '', /ссылки нет/);
});

test('preview tokens are one-time, scoped and expire', () => {
  let clock = 0;
  const store = createTokenStore({ ttlMs: 1000, now: () => new Date(clock) });
  const first = store.issue('claude:p1', 'fp');
  assert.equal(store.consume('claude:p2', first.token), undefined);
  assert.equal(store.consume('claude:p1', 'other'), undefined);
  assert.equal(store.consume('claude:p1', first.token), 'fp');
  assert.equal(store.consume('claude:p1', first.token), undefined);
  const old = store.issue('claude:p1', 'a');
  const replaced = store.issue('claude:p1', 'b');
  assert.equal(store.consume('claude:p1', old.token), undefined);
  clock = 5000;
  assert.equal(store.consume('claude:p1', replaced.token), undefined);
  assert.equal(new Date(replaced.expiresAt).getTime(), 1000);
});
