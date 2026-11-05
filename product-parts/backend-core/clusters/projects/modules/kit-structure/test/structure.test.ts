import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import {
  AGENTS_BEGIN,
  AGENTS_END,
  MANIFEST_PATH,
  STRUCTURE_VERSION,
  StructureError,
  checkStructure,
  hookCommand,
  installStructure,
  sha256,
} from '../src/index.ts';
import type { StructureReport } from '../src/index.ts';

let tmp = '';
let counter = 0;

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-structure-'));
});
after(async () => {
  await rm(tmp, { recursive: true, force: true });
});

async function project(files: Record<string, string> = {}): Promise<string> {
  const root = path.join(tmp, `p${++counter}`);
  await mkdir(root, { recursive: true });
  for (const [name, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(path.join(root, name), text);
  }
  return root;
}

const read = (root: string, name: string): Promise<string> => readFile(path.join(root, name), 'utf8');
const statusOf = (report: StructureReport, id: string): string | undefined => report.fragments.find((f) => f.id === id)?.status;

const HARNESS_AGENTS = `# Project rules

Text written by the user.

<!-- workflow-kit:begin -->
## Workflow Kit (managed section — do not edit by hand)

Harness instructions.
<!-- workflow-kit:end -->

Footer by the user.
`;

const HARNESS_CODEX_HOOKS = {
  hooks: {
    SessionStart: [{ matcher: 'startup', hooks: [{ type: 'command', command: 'scripts/workflow recover --format text' }] }],
    Stop: [{ hooks: [{ type: 'command', command: 'harness stop' }] }],
  },
};

test('an empty folder is "missing"; install writes everything and the result is "ok"', async () => {
  const root = await project();
  const before = await checkStructure(root);
  assert.equal(before.status, 'missing');
  assert.equal(before.installedVersion, null);
  assert.equal(before.installable, true);

  const result = await installStructure(root);
  assert.equal(result.report.status, 'ok');
  assert.deepEqual(result.skipped, []);
  assert.ok(result.written.includes('manifest'));

  const agents = await read(root, 'AGENTS.md');
  assert.ok(agents.startsWith(`${AGENTS_BEGIN}\n## Workflow Kit`));
  assert.match(agents, /product-parts\/<part>\/clusters\/<cluster>\/modules\/<module>\//);
  assert.ok(agents.trimEnd().endsWith(AGENTS_END));
  assert.equal(await read(root, 'CLAUDE.md'), '@AGENTS.md\n');
  assert.equal(await read(root, '.gitignore'), '# wfk:begin\n.workflow-kit/local/\n# wfk:end\n');
  for (const name of ['product-part.md', 'cluster.md', 'module.md']) {
    const template = await read(root, `.workflow-kit/templates/${name}`);
    for (const heading of ['## Purpose', '## Public interface', '## Invariants', '## Dependencies']) assert.match(template, new RegExp(heading));
  }
  assert.match(await read(root, 'product-parts/README.md'), /product parts, clusters and modules/);

  const claude = JSON.parse(await read(root, '.claude/settings.json'));
  assert.deepEqual(claude, { hooks: { SessionStart: [{ hooks: [{ type: 'command', command: hookCommand('claude') }] }] } });
  assert.equal(
    hookCommand('codex'),
    '[ -x "$HOME/.local/bin/wfk" ] && "$HOME/.local/bin/wfk" hook session-start --client codex; exit 0',
  );
  const codex = JSON.parse(await read(root, '.codex/hooks.json'));
  assert.equal(codex.hooks.SessionStart[0].hooks[0].command, hookCommand('codex'));

  const manifest = JSON.parse(await read(root, MANIFEST_PATH));
  assert.equal(manifest.version, STRUCTURE_VERSION);
  assert.deepEqual(Object.keys(manifest.fragments).sort(), [
    'agents-section',
    'claude-hook',
    'codex-hook',
    'gitignore-block',
    'product-parts-readme',
    'template-cluster',
    'template-module',
    'template-product-part',
  ]);
  assert.equal(manifest.fragments['template-module'].sha256, sha256(await read(root, '.workflow-kit/templates/module.md')));
  if (process.platform !== 'win32') assert.equal((await stat(path.join(root, 'AGENTS.md'))).mode & 0o777, 0o644);
});

test('a repeated install writes nothing', async () => {
  const root = await project();
  await installStructure(root);
  const snapshot = await Promise.all(['AGENTS.md', '.claude/settings.json', '.codex/hooks.json', MANIFEST_PATH].map((f) => read(root, f)));
  const again = await installStructure(root);
  assert.deepEqual(again.written, []);
  assert.equal(again.report.status, 'ok');
  const after = await Promise.all(['AGENTS.md', '.claude/settings.json', '.codex/hooks.json', MANIFEST_PATH].map((f) => read(root, f)));
  assert.deepEqual(after, snapshot);
  assert.equal(JSON.parse(await read(root, '.claude/settings.json')).hooks.SessionStart.length, 1);
});

test('foreign sections, Harness markers and text outside the Kit markers stay unchanged', async () => {
  const root = await project({
    'AGENTS.md': HARNESS_AGENTS,
    '.codex/hooks.json': JSON.stringify(HARNESS_CODEX_HOOKS, null, 4),
    '.claude/settings.json': JSON.stringify({ permissions: { allow: ['Bash(ls)'] }, hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'echo hi' }] }] } }),
    '.gitignore': 'node_modules/\n',
  });
  await installStructure(root);

  const agents = await read(root, 'AGENTS.md');
  assert.ok(agents.startsWith(HARNESS_AGENTS), 'the user and Harness text is kept byte for byte');
  assert.equal((agents.match(/<!-- workflow-kit:begin -->/g) ?? []).length, 1);
  assert.equal((agents.match(/<!-- wfk:begin -->/g) ?? []).length, 1);

  const codex = JSON.parse(await read(root, '.codex/hooks.json'));
  assert.deepEqual(codex.hooks.SessionStart[0], HARNESS_CODEX_HOOKS.hooks.SessionStart[0], 'Harness hook keeps position 0');
  assert.deepEqual(codex.hooks.SessionStart[1], { hooks: [{ type: 'command', command: hookCommand('codex') }] }, 'Kit hook is appended at the end');
  assert.deepEqual(codex.hooks.Stop, HARNESS_CODEX_HOOKS.hooks.Stop);
  assert.match(await read(root, '.codex/hooks.json'), /^ {4}"hooks"/m, 'existing indentation is kept');

  const claude = JSON.parse(await read(root, '.claude/settings.json'));
  assert.deepEqual(claude.permissions, { allow: ['Bash(ls)'] });
  assert.equal(claude.hooks.SessionStart[0].hooks[0].command, 'echo hi');
  assert.equal(claude.hooks.SessionStart[1].hooks[0].command, hookCommand('claude'));

  assert.equal(await read(root, '.gitignore'), 'node_modules/\n\n# wfk:begin\n.workflow-kit/local/\n# wfk:end\n');
});

test('edits outside the Kit section keep "ok", edits inside give "modified" and are not overwritten', async () => {
  const root = await project({ 'AGENTS.md': HARNESS_AGENTS });
  await installStructure(root);
  await writeFile(path.join(root, 'AGENTS.md'), `Prefix line\n${await read(root, 'AGENTS.md')}\nMore user text.\n`);
  assert.equal((await checkStructure(root)).status, 'ok');

  const edited = (await read(root, 'AGENTS.md')).replace('### Local data', '### Local data (edited)');
  await writeFile(path.join(root, 'AGENTS.md'), edited);
  const report = await checkStructure(root);
  assert.equal(report.status, 'modified');
  assert.equal(statusOf(report, 'agents-section'), 'modified');
  assert.equal(report.installable, false);

  const result = await installStructure(root);
  assert.deepEqual(result.skipped, [{ id: 'agents-section', status: 'modified' }]);
  assert.equal(await read(root, 'AGENTS.md'), edited);

  const forced = await installStructure(root, { force: true });
  assert.deepEqual(forced.written, ['agents-section']);
  assert.equal(forced.report.status, 'ok');
  assert.ok((await read(root, 'AGENTS.md')).startsWith(`Prefix line\n${HARNESS_AGENTS}`));
});

test('a fragment written by an older Kit is "outdated", by a newer Kit "newer"', async () => {
  const root = await project();
  await installStructure(root);
  const manifestFile = path.join(root, MANIFEST_PATH);
  const oldBody = '.workflow-kit/local/\n.workflow-kit/old/\n';
  await writeFile(path.join(root, '.gitignore'), `# wfk:begin\n${oldBody}# wfk:end\n`);
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  manifest.fragments['gitignore-block'] = { path: '.gitignore', sha256: sha256(oldBody), version: STRUCTURE_VERSION - 1 };
  await writeFile(manifestFile, JSON.stringify(manifest));
  let report = await checkStructure(root);
  assert.equal(statusOf(report, 'gitignore-block'), 'outdated');
  assert.equal(report.status, 'outdated');
  assert.equal(report.installable, true);

  manifest.fragments['gitignore-block'].version = STRUCTURE_VERSION + 1;
  await writeFile(manifestFile, JSON.stringify(manifest));
  report = await checkStructure(root);
  assert.equal(report.status, 'newer');
  assert.equal((await installStructure(root)).skipped[0]?.status, 'newer');

  manifest.fragments['gitignore-block'].version = STRUCTURE_VERSION - 1;
  await writeFile(manifestFile, JSON.stringify(manifest));
  const updated = await installStructure(root);
  assert.deepEqual(updated.written, ['gitignore-block', 'manifest']);
  assert.equal(updated.report.status, 'ok');
});

test('invalid JSON or broken markers refuse the install without writing anything', async () => {
  const root = await project({ '.claude/settings.json': '{ "hooks": ', 'AGENTS.md': 'User text\n' });
  const report = await checkStructure(root);
  assert.equal(statusOf(report, 'claude-hook'), 'modified');
  assert.match(report.fragments.find((f) => f.id === 'claude-hook')?.error ?? '', /invalid JSON/);
  await assert.rejects(installStructure(root), (error: unknown) => {
    assert.ok(error instanceof StructureError);
    assert.equal(error.code, 'invalid-json');
    assert.deepEqual(error.files, ['.claude/settings.json']);
    return true;
  });
  assert.equal(await read(root, '.claude/settings.json'), '{ "hooks": ');
  assert.equal(await read(root, 'AGENTS.md'), 'User text\n');
  assert.deepEqual((await readdir(root)).sort(), ['.claude', 'AGENTS.md']);

  const broken = await project({ 'AGENTS.md': `${AGENTS_BEGIN}\nno end marker\n` });
  await assert.rejects(installStructure(broken), (error: unknown) => error instanceof StructureError && error.code === 'bad-markers');

  const shape = await project({ '.codex/hooks.json': '{ "hooks": [] }' });
  await assert.rejects(installStructure(shape), (error: unknown) => error instanceof StructureError && error.code === 'bad-shape');
});

test('CLAUDE.md without @AGENTS.md gives a warning and is never changed', async () => {
  const root = await project({ 'CLAUDE.md': '# My Claude notes\n' });
  const result = await installStructure(root);
  assert.equal(await read(root, 'CLAUDE.md'), '# My Claude notes\n');
  assert.equal(statusOf(result.report, 'claude-md'), 'ok');
  assert.match(result.report.warnings.join('\n'), /CLAUDE\.md не подключает @AGENTS\.md/);
  const good = await project({ 'CLAUDE.md': 'Intro\n@AGENTS.md\n' });
  assert.deepEqual((await checkStructure(good)).warnings, []);
});

test('an existing product-parts directory and existing code are not changed', async () => {
  const root = await project({ 'product-parts/app/product-part.md': '# App\n', 'src/main.ts': 'export {};\n' });
  const result = await installStructure(root);
  assert.equal(result.report.status, 'ok');
  assert.deepEqual(await readdir(path.join(root, 'product-parts')), ['app']);
  assert.equal(await read(root, 'src/main.ts'), 'export {};\n');
  assert.equal(statusOf(result.report, 'product-parts-readme'), undefined);
  assert.match(result.report.notes.join('\n'), /product-parts уже есть/);
  assert.equal(JSON.parse(await read(root, MANIFEST_PATH)).fragments['product-parts-readme'], undefined);
});

test('a removed hook is "missing" and the next install appends it again', async () => {
  const root = await project();
  await installStructure(root);
  await writeFile(path.join(root, '.claude/settings.json'), '{ "hooks": { "SessionStart": [] } }\n');
  const report = await checkStructure(root);
  assert.equal(statusOf(report, 'claude-hook'), 'missing');
  assert.equal(report.status, 'missing');
  const result = await installStructure(root);
  assert.deepEqual(result.written, ['claude-hook']);
  assert.equal(result.report.status, 'ok');
});
