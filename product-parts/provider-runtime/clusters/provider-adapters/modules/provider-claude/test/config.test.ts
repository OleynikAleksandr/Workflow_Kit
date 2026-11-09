// External CLAUDE.md imports and the writer of ~/.claude.json on temporary folders.
import assert from 'node:assert/strict';
import { chmod, lstat, mkdir, mkdtemp, readFile, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import type { ProviderError } from '#provider-registry';
import { hasPatch, patchProjectEntry } from '../src/config-writer.ts';
import { importReferences, memoryFiles, scanExternalImports } from '../src/imports.ts';
import { claudeCapabilities } from '../src/programs.ts';

let tmp = '';
let home = '';
let project = '';

before(async () => {
  tmp = await realpath(await mkdtemp(path.join(os.tmpdir(), 'wfk-claude-config-')));
  home = path.join(tmp, 'home');
  project = path.join(home, 'Projects', 'demo');
  await mkdir(path.join(project, '.claude', 'rules', 'nested'), { recursive: true });
  await mkdir(path.join(home, '.claude', 'rules'), { recursive: true });
  // Parent memory: ~/CLAUDE.md imports ~/AGENTS.md, which imports ~/more.md (followed recursively).
  await writeFile(path.join(home, 'CLAUDE.md'), '@AGENTS.md\n');
  await writeFile(path.join(home, 'AGENTS.md'), 'see @~/more.md, then @missing.md\n');
  await writeFile(path.join(home, 'more.md'), 'end\n');
  // User memory is not project memory.
  await writeFile(path.join(home, '.claude', 'CLAUDE.md'), '@user-only.md\n');
  await writeFile(path.join(home, 'user-only.md'), 'x\n');
  await writeFile(path.join(home, '.claude', 'rules', 'user.md'), '@user-only.md\n');
  // Project memory: an inside import, an absolute outside one in a nested rule, imports inside code.
  await writeFile(path.join(project, 'CLAUDE.md'), '@docs/inside.md\n`@../../outside.md`\n```\n@../../outside.md\n```\n');
  await mkdir(path.join(project, 'docs'), { recursive: true });
  await writeFile(path.join(project, 'docs', 'inside.md'), 'inside\n');
  await writeFile(path.join(tmp, 'shared.md'), 'shared\n');
  await writeFile(path.join(project, '.claude', 'rules', 'nested', 'r.md'), `Rule: @${path.join(tmp, 'shared.md')}.\n`);
});

after(async () => {
  await rm(tmp, { recursive: true, force: true });
});

test('import references: plain, ~/ and escaped paths; code is skipped; email-like text is not an import', () => {
  assert.deepEqual(importReferences('@a.md and @~/b.md, @c\\ d.md\nmail me@example.com\n`@code.md`\n```sh\n@fenced.md\n```\n@e.md#part'), [
    'a.md',
    '~/b.md',
    'c d.md',
    'e.md',
  ]);
});

test('external imports: parents and rules are scanned, user memory is skipped, inside imports are not external', async () => {
  const files = await memoryFiles(project, home);
  assert.ok(files.includes(path.join(home, 'CLAUDE.md')));
  assert.ok(files.includes(path.join(project, '.claude', 'rules', 'nested', 'r.md')));
  assert.ok(!files.some((f) => f.startsWith(path.join(home, '.claude'))));
  const scan = await scanExternalImports(project, home);
  assert.deepEqual(
    scan.imports.map((i) => [path.relative(tmp, i.file), path.relative(tmp, i.from)]),
    [
      ['shared.md', 'home/Projects/demo/.claude/rules/nested/r.md'],
      ['home/AGENTS.md', 'home/CLAUDE.md'],
      ['home/more.md', 'home/AGENTS.md'],
    ],
  );
  assert.equal((await scanExternalImports(project, home)).fingerprint, scan.fingerprint);
  await writeFile(path.join(home, 'more.md'), 'changed\n');
  assert.notEqual((await scanExternalImports(project, home)).fingerprint, scan.fingerprint, 'imported text is part of the fingerprint');
  assert.deepEqual((await scanExternalImports(path.join(tmp, 'nowhere'), path.join(tmp, 'nohome'))).imports, []);
});

test('the writer merges keys into one project entry, keeps the rest, the mode and a symlink', async () => {
  const dir = path.join(tmp, 'writer');
  await mkdir(dir, { recursive: true });
  const real = path.join(dir, 'real.json');
  const link = path.join(dir, '.claude.json');
  await writeFile(real, JSON.stringify({ a: 1, projects: { '/p': { allowedTools: ['x'] }, '/q': { hasTrustDialogAccepted: true } } }));
  await chmod(real, 0o604);
  await symlink(real, link);
  const result = await patchProjectEntry(link, '/p', { hasTrustDialogAccepted: true });
  assert.deepEqual(result, { attempts: 1, created: false });
  assert.ok((await lstat(link)).isSymbolicLink(), 'the link stays a link');
  assert.equal((await stat(real)).mode & 0o777, 0o604);
  const text = await readFile(real, 'utf8');
  assert.deepEqual(JSON.parse(text), { a: 1, projects: { '/p': { allowedTools: ['x'], hasTrustDialogAccepted: true }, '/q': { hasTrustDialogAccepted: true } } });
  assert.ok(text.startsWith('{\n  "a": 1'));
  assert.equal(hasPatch(text, '/p', { hasTrustDialogAccepted: true }), true);
  assert.equal(hasPatch(text, '/q', { other: 1 }), false);

  const missing = path.join(dir, 'new.json');
  assert.deepEqual(await patchProjectEntry(missing, '/n', { k: true }), { attempts: 1, created: true });
  assert.equal((await stat(missing)).mode & 0o777, 0o600);

  const broken = path.join(dir, 'broken.json');
  await writeFile(broken, '{ nope');
  await assert.rejects(patchProjectEntry(broken, '/p', { k: true }), (error: unknown) => (error as ProviderError).code === 'config-broken');
  assert.equal(await readFile(broken, 'utf8'), '{ nope', 'a broken file is never overwritten');
});

test('writing trust needs no expect; sessions do', () => {
  const caps = claudeCapabilities('linux', { claude: '/bin/claude', expect: null }, '2.1.318');
  assert.equal(caps['trust']?.available, true);
  assert.equal(caps['createSession']?.available, false);
});
