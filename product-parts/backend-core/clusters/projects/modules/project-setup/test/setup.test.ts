// The wizard end to end on a temporary HOME: real git and the real Kit bundle (2.2.3), fake Codex,
// Claude and a third provider (a hook written into a file) that record what the wizard asks.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createApp } from '#cli';
import { KIT_VERSION, ensureKitBundle } from '#kit-bundle';
import type { App } from '#cli';
import { ProviderError } from '#provider-registry';
import type { Provider, ProviderFactory } from '#provider-registry';

let tmp = '';
let home = '';
let app: App;
let base = '';
const calls: string[] = [];
let codexTrustFails = false;
/** Hash of the third provider's hook as its preview shows it and as its file really is. */
let thirdShown = 'sha256:t1';
let thirdReal = 'sha256:t1';
/** The third provider cannot write its hook (its file has a form Kit does not change). */
let thirdUnknown = false;
/** How many next reads of the third provider's hook fail (a file that cannot be read for a while). */
let thirdHooksFail = 0;

const TITLES: Record<string, { title: string; label?: string; mark?: string }> = {
  codex: { title: 'ChatGPT (Codex)', label: 'ChatGPT', mark: 'G' },
  claude: { title: 'Claude' },
  third: { title: 'Третий', mark: 'т' },
};

function fakeProvider(id: 'claude' | 'codex' | 'third'): ProviderFactory {
  return () => {
    const trusted = new Set<string>();
    const hookState = (): { command: string; hash: string } => (id === 'third' ? { command: '[[hooks]] third', hash: thirdShown } : { command: 'kit', hash: 'sha256:k' });
    // An approval holds for the hash it was given for.
    const approvedHashes = new Set<string>();
    const isApproved = (): boolean => approvedHashes.has(hookState().hash);
    const provider: Partial<Provider> = {
      id,
      ...TITLES[id]!,
      capabilities: async () => ({ createSession: { available: true }, trust: { available: true } }),
      status: async () => ({ installed: true }) as never,
      previewTrust: async (project) => ({
        provider: id,
        trusted: trusted.has(project.path),
        writes: trusted.has(project.path) ? [] : [{ file: path.join(home, `.${id}`, 'config'), key: 'trust', value: 'trusted', description: 'trust' }],
        autorun: [],
        token: `tok-${id}`,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
      grantTrust: async (project, token) => {
        if (id === 'codex' && codexTrustFails) throw new Error('connection: codex app-server exited (code 1)\nCODEX_HOME missing');
        calls.push(`${id}:grant:${token}`);
        trusted.add(project.path);
        return { trusted: true, backup: `/backups/${id}` };
      },
      trust: async (project) => ({ trusted: trusted.has(project.path) }),
      hooks: async () => {
        if (id === 'third' && thirdHooksFail > 0) {
          thirdHooksFail -= 1;
          throw new Error('config unreadable');
        }
        if (id === 'third' && thirdUnknown) return { kitHook: { command: '[[hooks]] third', hash: '', kit: true, status: 'unknown' }, hooks: [], complete: null, writes: [], note: 'файл не разобран' };
        return {
          kitHook: { ...hookState(), kit: true, status: isApproved() ? 'approved' : 'pending' },
          hooks: [],
          complete: isApproved(),
          ...(id === 'third' ? { writes: [{ file: path.join(home, '.third', 'config.toml'), description: 'хук конца хода', value: '[[hooks]] third' }], note: 'хук общий для всех проектов' } : {}),
        };
      },
      // Claude has no hook approval, as the real provider.
      ...(id === 'claude'
        ? {}
        : {
            approveHooks: async (_project, expected) => {
              if (id === 'third' && expected.hash !== thirdReal) throw new ProviderError('hooks-changed', 'config changed', { status: 409 });
              calls.push(`${id}:approve:${expected.command}:${expected.hash}`);
              approvedHashes.add(expected.hash);
              return { kitHook: null, hooks: [], complete: true };
            },
          }),
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
    providers: [fakeProvider('codex'), fakeProvider('claude'), fakeProvider('third')],
  });
  base = `http://127.0.0.1:${(await app.start()).port}`;
});

after(async () => {
  await app.stop();
  // Windows may keep a folder busy for a moment after its watchers closed.
  await rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
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
  // Buttons, trust and hook actions follow the registry: nothing is named in the wizard itself.
  assert.deepEqual(p['actions'].map((a: { id: string }) => a.id), ['structure', 'kit', 'git', 'trust-codex', 'hooks-codex', 'trust-claude', 'trust-third', 'hooks-third']);
  assert.deepEqual(p['providers'], [
    { id: 'codex', label: 'ChatGPT', mark: 'G', available: true, reason: null },
    { id: 'claude', label: 'Claude', mark: 'C', available: true, reason: null },
    { id: 'third', label: 'Третий', mark: 'Т', available: true, reason: null },
  ]);
  const byId = Object.fromEntries(p['actions'].map((a: { id: string; title: string; detail: string }) => [a.id, a]));
  assert.equal(byId['trust-codex'].title, 'Доверие папке в ChatGPT');
  assert.equal(byId['trust-third'].detail, 'копия ~/.third/config до записи');
  assert.equal(byId['hooks-third'].detail, 'запись в ~/.third/config.toml — текст показан ниже');
  // What a hook approval writes is shown before the consent, with the hash that will be approved.
  assert.deepEqual(p['hooks'].map((h: { provider: string; hash: string }) => [h.provider, h.hash]), [['codex', 'sha256:k'], ['third', 'sha256:t1']]);
  const third = p['hooks'][1];
  assert.equal(third.label, 'Третий');
  assert.equal(third.command, '[[hooks]] third');
  assert.equal(third.note, 'хук общий для всех проектов');
  assert.deepEqual(third.writes, [{ file: path.join(home, '.third', 'config.toml'), description: 'хук конца хода', value: '[[hooks]] third' }]);

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
    ['trust-codex', 'done'],
    ['trust-claude', 'done'],
    ['trust-third', 'done'],
    ['session', 'done'],
  ]);
  assert.deepEqual(run.steps.filter((s) => s.id.startsWith('trust-')).map((s) => s.title), ['Доверие ChatGPT и хуки Kit', 'Доверие Claude', 'Доверие Третий и хуки Kit']);
  assert.equal(run.providerLabel, 'ChatGPT');
  assert.equal(run.links.desktop, 'codex://threads/thread-1');
  const folder = p['path'] as string;
  const log = git(folder, 'log', '--format=%s');
  assert.match(log, new RegExp(`chore: install workflow kit ${KIT_VERSION.replace(/\./g, '\\.')}`));
  assert.match(log, /chore: add Workflow Kit structure/);
  assert.equal(git(folder, 'status', '--porcelain'), '', 'the tree is clean after the wizard');
  assert.match(await readFile(path.join(folder, 'AGENTS.md'), 'utf8'), /wfk session title/);
  assert.deepEqual(calls.filter((c) => !c.includes(':session:')), [
    'codex:grant:tok-codex',
    'codex:approve:kit:sha256:k',
    'claude:grant:tok-claude',
    'third:grant:tok-third',
    'third:approve:[[hooks]] third:sha256:t1',
  ]);
  assert.match(calls.find((c) => c.startsWith('codex:session:'))!, /^codex:session:Склад:Проект «Склад» создан панелью Workflow Kit\. Прочитай AGENTS\.md/);
  assert.ok((await app.projects.list()).some((project) => project.path === folder));

  const again = await send('/api/setup/preview', { mode: 'create', name: 'Склад' });
  assert.equal(again.status, 409);
  assert.equal(again.json['error'].code, 'exists');
});

test('open: an older Kit (KIT_OUTDATED) is updated to the app bundle, not installed again', async () => {
  const folder = path.join(home, 'Outdated');
  await mkdir(folder);
  await writeFile(path.join(folder, 'README.md'), '# Outdated\n');
  git(folder, 'init', '-q');
  git(folder, 'add', 'README.md');
  git(folder, 'commit', '-q', '-m', 'init');
  const bundle = await ensureKitBundle({ appDir: path.join(tmp, 'direct-kit') });
  execFileSync(process.execPath, [bundle.file, 'install', folder, '--host', 'harness'], { cwd: folder, env: { PATH: process.env['PATH'], HOME: home, GIT_CONFIG_GLOBAL: path.join(home, '.gitconfig') } });
  // The manifest of an older Kit: inspect answers KIT_OUTDATED.
  const manifestFile = path.join(folder, '.harness', 'workflow', 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  await writeFile(manifestFile, `${JSON.stringify({ ...manifest, version: '2.2.2' }, null, 2)}\n`);
  const preview = await send('/api/setup/preview', { mode: 'open', path: folder });
  assert.equal(preview.status, 200, JSON.stringify(preview.json));
  assert.equal(preview.json['kit'].action, 'update');
  const kit = preview.json['actions'].find((a: { id: string }) => a.id === 'kit');
  assert.deepEqual([kit.title, kit.detail], [`Процесс Kit ${KIT_VERSION}`, 'обновление с 2.2.2']);
  const applied = await send('/api/setup/apply', { token: preview.json['token'], provider: 'claude' });
  const operation = await app.operations.wait(applied.json['operationId']);
  assert.equal(operation.status, 'succeeded', JSON.stringify(operation.error));
  const run = app.setup.get(applied.json['operationId'])!;
  assert.deepEqual(run.steps.find((s) => s.id === 'kit')?.note, `Kit ${KIT_VERSION}`);
  assert.equal(JSON.parse(await readFile(manifestFile, 'utf8')).version, KIT_VERSION);
  assert.match(git(folder, 'log', '--format=%s'), new RegExp(`chore: update workflow kit to ${KIT_VERSION.replace(/\./g, '\\.')}`));
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
  // The temporary folder lies outside home and, on Windows, on the system drive: outside the roots on every OS.
  const outside = await send('/api/settings/projects-root', { path: path.join(tmp, 'elsewhere') });
  assert.equal(outside.status, 400);
  assert.equal(outside.json['error'].code, 'outside-roots');
});

test('the other provider\'s trust is best effort; the chosen provider\'s trust is required', async () => {
  codexTrustFails = true;
  try {
    const preview = await send('/api/setup/preview', { mode: 'create', name: 'Пилот' });
    const applied = await send('/api/setup/apply', { token: preview.json['token'], provider: 'claude' });
    const operation = await app.operations.wait(applied.json['operationId']);
    assert.equal(operation.status, 'succeeded', JSON.stringify(operation.error));
    const step = app.setup.get(applied.json['operationId'])!.steps.find((s) => s.id === 'trust-codex')!;
    assert.equal(step.status, 'skipped');
    assert.equal(step.note, 'не получилось: connection: codex app-server exited (code 1) — можно дать позже в «Настройках»');

    const second = await send('/api/setup/preview', { mode: 'create', name: 'Пилот2' });
    const failed = await send('/api/setup/apply', { token: second.json['token'], provider: 'codex' });
    const outcome = await app.operations.wait(failed.json['operationId']);
    assert.equal(outcome.status, 'failed');
    assert.equal(app.setup.get(failed.json['operationId'])!.steps.find((s) => s.id === 'trust-codex')!.status, 'failed');
  } finally {
    codexTrustFails = false;
  }
});

test('a hook is approved with the shown hash; a hook changed after the preview is refused', async () => {
  // The hash is part of the fingerprint: a hook that changed before the consent makes the preview stale.
  const first = await send('/api/setup/preview', { mode: 'create', name: 'Хук1' });
  thirdShown = thirdReal = 'sha256:t2';
  try {
    const stale = await send('/api/setup/apply', { token: first.json['token'], provider: 'third' });
    assert.equal(stale.status, 409);
    assert.equal(stale.json['error'].code, 'preview-stale');

    // The file changes while the wizard runs: the provider is asked with the shown hash, not a re-read one.
    const second = await send('/api/setup/preview', { mode: 'create', name: 'Хук2' });
    assert.equal(second.json['hooks'].find((h: { provider: string }) => h.provider === 'third').hash, 'sha256:t2');
    thirdReal = 'sha256:t3';
    const applied = await send('/api/setup/apply', { token: second.json['token'], provider: 'third' });
    const operation = await app.operations.wait(applied.json['operationId']);
    assert.equal(operation.status, 'failed');
    const run = app.setup.get(applied.json['operationId'])!;
    assert.equal(run.error?.code, 'hooks-changed');
    assert.equal(run.error?.hint, 'Проверьте предпросмотр ещё раз.');
    assert.equal(run.steps.find((s) => s.id === 'trust-third')!.status, 'failed');
    assert.equal(run.steps.find((s) => s.id === 'session')!.status, 'pending');
    assert.ok(!calls.some((c) => c.startsWith('third:approve:') && c.endsWith(':sha256:t2')), 'nothing was approved');

    // For a provider that is not the chosen one the step is skipped with a note.
    const other = await send('/api/setup/preview', { mode: 'create', name: 'Хук3' });
    const done = await send('/api/setup/apply', { token: other.json['token'], provider: 'claude' });
    assert.equal((await app.operations.wait(done.json['operationId'])).status, 'succeeded');
    const step = app.setup.get(done.json['operationId'])!.steps.find((s) => s.id === 'trust-third')!;
    assert.equal(step.status, 'skipped');
    assert.match(step.note!, /^не получилось: Хук Kit для Третий изменился после предпросмотра/);

    const unknown = await send('/api/setup/apply', { token: (await send('/api/setup/preview', { mode: 'create', name: 'Хук4' })).json['token'], provider: 'nobody' });
    assert.equal(unknown.status, 400);
    assert.equal(unknown.json['error'].code, 'bad-provider');
  } finally {
    thirdShown = thirdReal = 'sha256:t1';
  }
});

test('a hook that Kit cannot write is shown with its reason and is left for a manual edit', async () => {
  const approvals = (): number => calls.filter((c) => c.startsWith('third:approve:')).length;
  const before = approvals();
  const stepNote = async (name: string): Promise<string> => {
    const shown = await send('/api/setup/preview', { mode: 'create', name });
    const applied = await send('/api/setup/apply', { token: shown.json['token'], provider: 'claude' });
    assert.equal((await app.operations.wait(applied.json['operationId'])).status, 'succeeded');
    return app.setup.get(applied.json['operationId'])!.steps.find((s) => s.id === 'trust-third')!.note!;
  };
  thirdUnknown = true;
  try {
    const shown = await send('/api/setup/preview', { mode: 'create', name: 'Хук5' });
    assert.deepEqual(shown.json['hooks'].find((h: { provider: string }) => h.provider === 'third'), {
      provider: 'third',
      label: 'Третий',
      status: 'unknown',
      command: '[[hooks]] third',
      hash: '',
      writes: [],
      note: 'файл не разобран',
    });
    assert.equal(shown.json['actions'].find((a: { id: string }) => a.id === 'hooks-third').detail, 'Workflow Kit не запишет их сам — причина показана ниже');
    assert.match(await stepNote('Хук6'), /хук Kit для Третий не записан: добавьте его вручную$/);
  } finally {
    thirdUnknown = false;
  }
  // The hook could not be read at the preview and at the consent: a hook written into a file is never approved unseen.
  thirdShown = thirdReal = 'sha256:t9';
  thirdHooksFail = 2;
  try {
    assert.match(await stepNote('Хук7'), /хук Kit для Третий не записан: его не было в предпросмотре — откройте проект мастером ещё раз$/);
    assert.equal(thirdHooksFail, 0);
    assert.equal(approvals(), before, 'nothing was approved');
  } finally {
    thirdShown = thirdReal = 'sha256:t1';
  }
});
