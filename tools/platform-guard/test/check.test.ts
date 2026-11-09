import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';
import {
  checkTree,
  directPlatformUses,
  formatIssue,
  isCheckedCode,
  programOf,
  readAllowlist,
  scanSource,
  specIssue,
  type Allowlist,
} from '../check.ts';

const NAMES = ['launchctl', 'systemctl', 'rundll32', 'powershell.exe', 'powershell', 'reg', 'expect'];
const SRC = 'product-parts/p/clusters/c/modules/m/src';
const roots: string[] = [];
after(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true });
});

async function tree(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wfk-guard-'));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), text);
  }
  return root;
}

function allowlist(extra: Partial<Allowlist> = {}): Allowlist {
  return { programNames: NAMES, directPlatform: [], programs: [], legacySpecs: [], ...extra };
}

const SPEC_OK = '# S\n\n## 1. Цель\n\ntext\n\n## 2. Поведение на ОС\n\n| macOS | Linux | Windows |\n\n## 3. План\n';

test('scanSource drops comments and keeps the static text of strings', () => {
  const source = [
    "// 'launchctl' in a comment",
    '/* `systemctl` */ const a = "x"; // trailing',
    "const url = 'http://host'; const t = `reg ${a ? `inner` : 'b'} tail`;",
  ].join('\n');
  const scanned = scanSource(source);
  assert.deepEqual(
    scanned.strings.map((s) => [s.value, s.line]),
    [['x', 2], ['http://host', 3], ['reg ', 3], ['inner', 3], ['b', 3], [' tail', 3]],
  );
  assert.equal(scanned.code.split('\n').length, 3);
  assert.ok(!scanned.code.includes('launchctl'));
});

test('rule A allows only an injectable default of process.platform', () => {
  const ok = [
    'const p = options.platform ?? process.platform;',
    'function f(platform = process.platform) {}',
    'const info = { platform: process.platform };',
  ];
  for (const line of ok) assert.deepEqual(directPlatformUses(scanSource(line).code), [], line);
  const bad = [
    "if (process.platform === 'win32') {}",
    "const win = process.platform !== 'darwin';",
    'const isWin = process.platform == x;',
    "switch (process.platform) { case 'linux': }",
    'run(process.platform);',
  ];
  for (const line of bad) assert.deepEqual(directPlatformUses(scanSource(`\n${line}`).code), [2], line);
  assert.deepEqual(directPlatformUses(scanSource("// process.platform === 'win32'").code), []);
});

test('programOf finds a program as the first word or the end of a path', () => {
  assert.equal(programOf('launchctl', NAMES), 'launchctl');
  assert.equal(programOf('systemctl --user start', NAMES), 'systemctl');
  assert.equal(programOf('/bin/launchctl', NAMES), 'launchctl');
  assert.equal(programOf('\\System32\\rundll32.exe', NAMES), 'rundll32');
  assert.equal(programOf('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', NAMES), 'powershell.exe');
  assert.equal(programOf('powershell.exe', NAMES), 'powershell.exe');
  assert.equal(programOf('registry', NAMES), null);
  assert.equal(programOf('open the reg', NAMES), null);
});

test('isCheckedCode covers product sources and bin, not tests, vendor or the browser panel', () => {
  assert.ok(isCheckedCode(`${SRC}/a.ts`));
  assert.ok(isCheckedCode(`${SRC}/pty/b.mjs`));
  assert.ok(isCheckedCode('bin/wfk.mjs'));
  assert.ok(!isCheckedCode('product-parts/p/clusters/c/modules/m/test/a.test.ts'));
  assert.ok(!isCheckedCode('product-parts/p/clusters/c/modules/m/vendor/lib/index.js'));
  assert.ok(!isCheckedCode('product-parts/control-panel/clusters/w/modules/m/src/app.js'));
  assert.ok(!isCheckedCode(`${SRC}/a.md`));
});

test('specIssue needs a level-2 OS section naming macOS, Linux and Windows', () => {
  assert.equal(specIssue(SPEC_OK), null);
  assert.equal(specIssue(SPEC_OK.replaceAll('\n', '\r\n')), null);
  assert.match(specIssue('# S\n\n## 1. Цель\n') ?? '', /Поведение на ОС/);
  assert.match(specIssue('## Поведение на ОС\n\nmacOS, Windows\n\n## План\nLinux\n') ?? '', /Linux/);
  assert.match(specIssue('### Поведение на ОС\nmacOS Linux Windows\n') ?? '', /add a level-2/);
});

test('checkTree reports direct platform checks and undescribed OS programs with lines', async () => {
  const root = await tree({
    [`${SRC}/a.ts`]: "export const p = 1;\nif (process.platform === 'win32') {}\nrun('systemctl', ['--user']);\n",
    [`${SRC}/b.ts`]: "run(`${dir}\\\\System32\\\\rundll32.exe`);\n",
    'product-parts/p/clusters/c/modules/m/test/a.test.ts': "run('launchctl'); if (process.platform === 'x') {}\n",
    'product-parts/control-panel/clusters/w/modules/m/src/app.js': "run('launchctl');\n",
  });
  const issues = await checkTree(root, allowlist());
  assert.deepEqual(
    issues.map(formatIssue).map((line) => line.split(' ').slice(0, 2).join(' ')),
    [`${SRC}/a.ts:2 platform-injected`, `${SRC}/a.ts:3 os-program`, `${SRC}/b.ts:1 os-program`],
  );
});

test('checkTree accepts described programs and allowlisted files, and flags stale or empty entries', async () => {
  const root = await tree({
    [`${SRC}/a.ts`]: "if (process.platform !== 'win32') chmod();\nrun('launchctl');\n",
    'docs/planning/M1.md': '# old\n',
  });
  const entry = { file: `${SRC}/a.ts`, program: 'launchctl', darwin: 'launchctl', linux: 'systemctl', win32: 'reg' };
  const good = allowlist({
    directPlatform: [{ file: `${SRC}/a.ts`, reason: 'chmod is not used on Windows' }],
    programs: [entry],
    legacySpecs: ['docs/planning/M1.md'],
  });
  assert.deepEqual(await checkTree(root, good), []);
  const bad = allowlist({
    directPlatform: [
      { file: `${SRC}/a.ts`, reason: ' ' },
      { file: `${SRC}/gone.ts`, reason: 'old' },
    ],
    programs: [{ ...entry, win32: '' }, { ...entry, program: 'expect' }],
    legacySpecs: ['docs/planning/M1.md', 'docs/planning/M0.md'],
  });
  const messages = (await checkTree(root, bad)).map((issue) => issue.message);
  assert.deepEqual(messages.sort(), [
    `directPlatform entry ${SRC}/a.ts needs a reason`,
    `programs entry ${SRC}/a.ts launchctl needs win32`,
    `stale directPlatform entry ${SRC}/gone.ts`,
    `stale legacySpecs entry docs/planning/M0.md`,
    `stale programs entry ${SRC}/a.ts expect`,
  ].sort());
});

test('checkTree requires the OS section in specs outside legacySpecs', async () => {
  const root = await tree({
    'docs/planning/M1.md': '# old\n',
    'docs/planning/M7.md': '# new\n\n## 1. Цель\n',
    'docs/planning/M8.md': SPEC_OK,
    'docs/planning/sub/notes.md': '# not a spec\n',
  });
  const issues = await checkTree(root, allowlist({ legacySpecs: ['docs/planning/M1.md'] }));
  assert.deepEqual(issues.map((i) => `${i.file} ${i.rule}`), ['docs/planning/M7.md spec-os-section']);
});

test('the repository passes its own platform guard', async () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.join(here, '..', '..', '..');
  const issues = await checkTree(root, await readAllowlist(path.join(here, '..', 'allowlist.json')));
  assert.deepEqual(issues.map(formatIssue), []);
});
