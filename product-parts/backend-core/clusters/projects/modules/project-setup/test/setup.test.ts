// The wizard end to end on a temporary HOME: real git and the real Kit 2.2.2 bundle, fake Claude
// and Codex providers that record what the wizard asks of them.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createApp } from '#cli';
import type { App } from '#cli';
import type { Provider, ProviderFactory } from '#provider-registry';

let tmp = '';
let home = '';
let app: App;
let base = '';
const calls: string[] = [];

function fakeProvider(id: 'claude' | 'codex'): ProviderFactory {
  return () => {
    const trusted = new Set<string>();
    let approved = false;
    const provider: Partial<Provider> = {
      id,
      title: id === 'codex' ? 'Codex' : 'Claude',
      capabilities: async () => ({ createSession: { available: true }, trust: { available: true } }),
      status: async () => ({ installed: true }) as never,
      previewTrust: async (project) => ({
        provider: id,
        trusted: trusted.has(project.path),
        writes: trusted.has(project.path) ? [] : [{ file: `~/.${id}`, key: 'trust', value: 'trusted', description: 'trust' }],
        autorun: [],
        token: `tok-${id}`,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
      grantTrust: async (project, token) => {
        calls.push(`${id}:grant:${token}`);
        trusted.add(project.path);
        return { trusted: true, backup: `/backups/${id}` };
      },
      trust: async (project) => ({ trusted: trusted.has(project.path) }),
      hooks: async () => ({
        kitHook: { command: 'kit', hash: 'sha256:k', kit: true, status: approved ? 'approved' : 'pending' },
        hooks: [],
        complete: approved,
      }),
      approveHooks: async (_project, expected) => {
        calls.push(`${id}:approve:${expected.hash}`);
        approved = true;
        return { kitHook: null, hooks: [], complete: true };
      },
      listSessions: async () => [],
      createSession: async (project, opts) => {
        calls.push(`${id}:session:${opts.title}:${opts.firstMessage ?? ''}`);
        return {
          provider: id,
          localId: 'thread-1',
          title: opts.title,
          createdAt: new Date().toISOString(),
          origin: 'panel',
          state: 'running',
          links: { desktop: `${id}://threads/thread-1` },
          cwd: project.path,
        };
      },
      actions: async () => [],
      runAction: async () => {
        throw new Error('no actions');
      },
    };
    return provider as Provider;
  };
}

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-setup-'));
  home = path.join(tmp, 'home');
  await mkdir(home);
  await writeFile(path.join(home, '.gitconfig'), '[user]\n\tname = Kit Tester\n\temail = kit.tester@wfk-tests.org\n[init]\n\tdefaultBranch = main\n');
  app = await createApp({
    env: { PATH: process.env['PATH'], HOME: home, GIT_CONFIG_GLOBAL: path.join(home, '.gitconfig'), GIT_CONFIG_NOSYSTEM: '1', WFK_DATA_DIR: path.join(tmp, 'data'), WFK_PORT: '0' },
    homedir: home,
    getInterfaces: () => ({}),
    providers: [fakeProvider('claude'), fakeProvider('codex')],
  });
  base = `http://127.0.0.1:${(await app.start()).port}`;
});

after(async () => {
  await app.stop();
  await rm(tmp, { recursive: true, force: true });
});

async function send(url: string, body: unknown): Promise<{ status: number; json: Record<string, any> }> {
  const response = await fetch(`${base}${url}`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, json: (await response.json()) as Record<string, any> };
}

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', env: { PATH: process.env['PATH'], HOME: home, GIT_CONFIG_GLOBAL: path.join(home, '.gitconfig') } });

test('create: preview, one consent, then everything happens and the session link is there', async () => {
  const preview = await send('/api/setup/preview', { mode: 'create', name: 'Склад' });
  assert.equal(preview.status, 200, JSON.stringify(preview.json));
  const p = preview.json;
  assert.equal(p['kit'].action, 'install');
  assert.equal(p['blocked'], null);
  assert.equal(p['exists'], false);
  assert.ok(p['changes'].count > 15);
  assert.ok(p['changes'].files.includes('.harness/workflow/runtime/workflow.mjs'));
  assert.deepEqual(p['actions'].map((a: { id: string }) => a.id), ['structure', 'kit', 'git', 'trust-claude', 'trust-codex', 'hooks-codex']);
  assert.equal(p['providers'].codex.available, true);

  const applied = await send('/api/setup/apply', { token: p['token'], provider: 'codex' });
  assert.equal(applied.status, 202, JSON.stringify(applied.json));
  const operation = await app.operations.wait(applied.json['operationId']);
  assert.equal(operation.status, 'succeeded', JSON.stringify(operation.error));
  const run = app.setup.get(applied.json['operationId'])!;
  assert.deepEqual(run.steps.map((s) => [s.id, s.status]), [
    ['project', 'done'],
    ['git', 'done'],
    ['structure', 'done'],
    ['kit', 'done'],
    ['trust-claude', 'done'],
    ['trust-codex', 'done'],
    ['session', 'done'],
  ]);
  assert.equal(run.links.desktop, 'codex://threads/thread-1');
  const folder = p['path'] as string;
  const log = git(folder, 'log', '--format=%s');
  assert.match(log, /chore: install workflow kit 2\.2\.2/);
  assert.match(log, /chore: add Workflow Kit structure/);
  assert.equal(git(folder, 'status', '--porcelain'), '', 'the tree is clean after the wizard');
  assert.match(await readFile(path.join(folder, 'AGENTS.md'), 'utf8'), /wfk session title/);
  assert.deepEqual(calls.filter((c) => !c.includes(':session:')), ['claude:grant:tok-claude', 'codex:grant:tok-codex', 'codex:approve:sha256:k']);
  assert.match(calls.find((c) => c.startsWith('codex:session:'))!, /^codex:session:Склад:Проект «Склад» создан панелью Workflow Kit\. Прочитай AGENTS\.md/);
  assert.ok((await app.projects.list()).some((project) => project.path === folder));

  const again = await send('/api/setup/preview', { mode: 'create', name: 'Склад' });
  assert.equal(again.status, 409);
  assert.equal(again.json['error'].code, 'exists');
});

test('open: a changed folder makes the preview stale; cancel stops before the next step', async () => {
  const folder = path.join(home, 'Old');
  await mkdir(folder);
  await writeFile(path.join(folder, 'notes.md'), '# Notes\n');
  const first = await send('/api/setup/preview', { mode: 'open', path: folder });
  assert.equal(first.json['kit'].action, 'install');
  assert.equal(first.json['git'].repository, false);
  await mkdir(path.join(folder, '.codex'));
  await writeFile(path.join(folder, '.codex', 'hooks.json'), '{"hooks": {"Stop": "broken"}}\n');
  const stale = await send('/api/setup/apply', { token: first.json['token'], provider: 'claude' });
  assert.equal(stale.status, 409);
  assert.equal(stale.json['error'].code, 'preview-stale');

  await rm(path.join(folder, '.codex'), { recursive: true });
  await writeFile(path.join(folder, 'AGENTS.md'), '# Mine\n');
  const second = await send('/api/setup/preview', { mode: 'open', path: folder });
  const applied = await send('/api/setup/apply', { token: second.json['token'], provider: 'claude' });
  app.setup.cancel(applied.json['operationId']);
  const operation = await app.operations.wait(applied.json['operationId']);
  assert.equal(operation.status, 'failed');
  assert.equal(operation.error?.code, 'cancelled');
  const run = app.setup.get(applied.json['operationId'])!;
  assert.equal(run.status, 'cancelled');
  assert.ok(run.steps.some((s) => s.status === 'pending'), 'later steps did not run');
  assert.match(await readFile(path.join(folder, 'AGENTS.md'), 'utf8'), /^# Mine/);
});

test('without a git identity the preview names the commands and apply is refused', async () => {
  await writeFile(path.join(home, '.gitconfig'), '[init]\n\tdefaultBranch = main\n');
  try {
    const preview = await send('/api/setup/preview', { mode: 'create', name: 'NoName' });
    assert.equal(preview.json['blocked'].code, 'GIT_IDENTITY_REQUIRED');
    assert.ok(preview.json['blocked'].commands.some((c: string) => c.startsWith('git config --global user.email')));
    const applied = await send('/api/setup/apply', { token: preview.json['token'], provider: 'codex' });
    assert.equal(applied.status, 409);
    assert.equal(applied.json['error'].code, 'GIT_IDENTITY_REQUIRED');
  } finally {
    await writeFile(path.join(home, '.gitconfig'), '[user]\n\tname = Kit Tester\n\temail = kit.tester@wfk-tests.org\n[init]\n\tdefaultBranch = main\n');
  }
});

test('projects: archive and restore keep the folder; the projects folder can change', async () => {
  const project = (await app.projects.list())[0]!;
  const archived = await send(`/api/projects/${project.id}/archive`, {});
  assert.ok(archived.json['project'].archivedAt);
  const restored = await send(`/api/projects/${project.id}/restore`, {});
  assert.equal(restored.json['project'].archivedAt, undefined);
  const root = await send('/api/settings/projects-root', { path: '~/Work' });
  assert.equal(root.status, 200, JSON.stringify(root.json));
  assert.equal(app.projects.root, root.json['root']);
  const config = JSON.parse(await readFile(path.join(tmp, 'data', 'config.json'), 'utf8'));
  assert.equal(config.projectsRoot, root.json['root']);
  const outside = await send('/api/settings/projects-root', { path: '/etc' });
  assert.equal(outside.status, 400);
});
