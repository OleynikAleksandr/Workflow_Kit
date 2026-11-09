import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectOfFolder, runProjectCommand } from '../src/project-command.ts';

test('the project of a folder is the deepest active project that contains it', () => {
  const list = [{ id: 'a', path: '/u/VSCODE' }, { id: 'b', path: '/u/VSCODE/App' }, { id: 'c', path: '/u/VSCODE/App/old', archivedAt: 'x' }];
  assert.equal(projectOfFolder(list, ['/u/VSCODE/App/old/src'], 'darwin')?.id, 'b');
  assert.equal(projectOfFolder(list, ['/elsewhere'], 'darwin'), null);
});

test('wfk project publish posts to the publish route and prints the result or the refusal', async () => {
  const out: string[] = [];
  const err: string[] = [];
  const posted: string[] = [];
  let reply = { status: 200, body: { published: true, commits: 3, sha: 'abcdef1234' } as unknown };
  const deps = {
    stdout: (t: string) => void out.push(t),
    stderr: (t: string) => void err.push(t),
    env: { WFK_PORT: '4747' },
    cwd: '/u/VSCODE/App',
    homedir: '/nonexistent-home',
    platform: 'darwin' as const,
    getJson: async () => ({ projects: [{ id: 'b', path: '/u/VSCODE/App' }] }),
    request: async (url: string) => (posted.push(url), reply),
  };
  assert.equal(await runProjectCommand(['publish'], deps), 0);
  assert.match(posted[0]!, /\/api\/projects\/b\/publish$/);
  assert.match(out[0]!, /коммитов 3, abcdef1/);
  reply = { status: 409, body: { error: { code: 'scope-open', message: 'Scope открыт — опубликовать можно после приёмки и закрытия' } } };
  assert.equal(await runProjectCommand(['publish'], deps), 1);
  assert.match(err.at(-1)!, /после приёмки и закрытия/);
  assert.equal(await runProjectCommand(['push'], deps), 64);
});
