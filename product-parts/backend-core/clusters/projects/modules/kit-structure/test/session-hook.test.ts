import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { MANIFEST_PATH, SESSIONS_JOURNAL_PATH, findProjectRoot, recordSessionStart } from '../src/index.ts';

let tmp = '';
let root = '';

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-hook-'));
  root = path.join(tmp, 'project');
  await mkdir(path.join(root, 'src', 'deep'), { recursive: true });
  await mkdir(path.join(root, '.workflow-kit'), { recursive: true });
  await writeFile(path.join(root, MANIFEST_PATH), '{"kit":"workflow-kit","version":1,"fragments":{}}\n');
});
after(async () => {
  await rm(tmp, { recursive: true, force: true });
});

const now = (): Date => new Date('2026-11-05T10:00:00.000Z');

async function journal(): Promise<Array<Record<string, unknown>>> {
  const text = await readFile(path.join(root, SESSIONS_JOURNAL_PATH), 'utf8');
  return text
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

test('findProjectRoot walks up to the folder with a Kit manifest', async () => {
  assert.equal(await findProjectRoot(path.join(root, 'src', 'deep')), root);
  assert.equal(await findProjectRoot(tmp), undefined);
});

test('a Claude hook with CLAUDE_PROJECT_DIR appends one line with the input fields', async () => {
  const stdin = JSON.stringify({
    session_id: 'abc-123',
    transcript_path: '/tmp/t.jsonl',
    cwd: path.join(root, 'src'),
    source: 'startup',
    model: 'claude-opus',
    permission_mode: 'default',
    hook_event_name: 'SessionStart',
    extra: { ignored: true },
  });
  const result = await recordSessionStart({ client: 'claude', stdin, env: { CLAUDE_PROJECT_DIR: root }, cwd: tmp, now });
  assert.equal(result.recorded, true);
  const lines = await journal();
  assert.equal(lines.length, 1);
  assert.deepEqual(lines[0], {
    time: '2026-11-05T10:00:00.000Z',
    client: 'claude',
    session_id: 'abc-123',
    transcript_path: '/tmp/t.jsonl',
    cwd: path.join(root, 'src'),
    source: 'startup',
    model: 'claude-opus',
    permission_mode: 'default',
    service: null,
  });
  if (process.platform !== 'win32') assert.equal((await stat(path.join(root, SESSIONS_JOURNAL_PATH))).mode & 0o777, 0o600);
});

test('a Codex hook finds the project above cwd and keeps the WFK_SERVICE_SESSION label', async () => {
  const result = await recordSessionStart({
    client: 'codex',
    stdin: JSON.stringify({ session_id: 'th-1', cwd: path.join(root, 'src', 'deep') }),
    env: { WFK_SERVICE_SESSION: 'trust' },
    cwd: tmp,
    now,
  });
  assert.equal(result.recorded, true);
  const last = (await journal()).at(-1);
  assert.equal(last?.['client'], 'codex');
  assert.equal(last?.['session_id'], 'th-1');
  assert.equal(last?.['service'], 'trust');
  assert.equal(last?.['model'], null);
});

test('bad input is tolerated; outside a project or with an unknown client nothing is written', async () => {
  const before = (await journal()).length;
  const bad = await recordSessionStart({ client: 'claude', stdin: 'not json', env: {}, cwd: path.join(root, 'src'), now });
  assert.equal(bad.recorded, true);
  assert.equal((await journal()).at(-1)?.['session_id'], null);
  assert.deepEqual(await recordSessionStart({ client: 'claude', stdin: '{}', env: {}, cwd: tmp }), {
    recorded: false,
    reason: 'no Workflow Kit project above the session folder',
  });
  assert.equal((await recordSessionStart({ client: 'gemini', stdin: '{}', env: {}, cwd: root })).recorded, false);
  assert.equal((await journal()).length, before + 1);
});
