// Setup of the shared access on Windows (spec M13 section 2.3): the texts of the administrator
// scripts and the whole flow on a fake Windows machine (PowerShell, ssh, ssh-keygen); the platform
// is injected, so it runs on every OS.
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createSharedAccess } from '../src/shared-access.ts';
import { CONNECTIONS_LINK, authorizedLine } from '../src/shared-files.ts';
import { adminCommand, adminRollbackScript, adminScript, gitShellCandidates, openInAppScript, psLiteral, toGitBashPath } from '../src/shared-windows-setup.ts';
import { PUB, deps, machine } from './shared-machine.ts';
import type { Machine } from './shared-machine.ts';

const GIT_SH = 'C:\\Program Files\\Git\\bin\\sh.exe';
const CONNECTION = '5120 "C:\\Windows\\System32\\OpenSSH\\ssh.exe" -T wfk-local sh -c codex app-server proxy';
const facts = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ sshd: '', defaultShell: '', app: 'C:\\Program Files\\WindowsApps\\OpenAI.Codex_1', processes: [], ...over });
const ready = { sshd: 'Running', defaultShell: GIT_SH };

test('Git Bash paths, Git shell candidates and PowerShell literals', () => {
  assert.equal(toGitBashPath('C:\\Users\\u\\AppData\\Roaming\\npm'), '/c/Users/u/AppData/Roaming/npm');
  assert.equal(toGitBashPath('D:\\'), '/d');
  assert.equal(toGitBashPath('/u/bin'), '/u/bin');
  const env = { ProgramFiles: 'C:\\Program Files', LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' };
  assert.deepEqual(gitShellCandidates(env, 'D:\\Tools\\Git\\cmd\\git.exe'), ['D:\\Tools\\Git\\bin\\sh.exe', GIT_SH, 'C:\\Users\\u\\AppData\\Local\\Programs\\Git\\bin\\sh.exe']);
  assert.deepEqual(gitShellCandidates({}, 'C:\\other\\git.exe'), []);
  assert.equal(psLiteral("it's"), "'it''s'");
  assert.equal(adminCommand('C:\\d\\a.ps1'), 'powershell -NoProfile -ExecutionPolicy Bypass -File "C:\\d\\a.ps1"');
  assert.match(openInAppScript(CONNECTIONS_LINK, 'OpenAI.Codex'), /Get-AppxPackage -Name 'OpenAI\.Codex'.*shell:AppsFolder.*'codex:\/\/settings\/connections\/ssh'/);
});

test('administrator script: sshd, DefaultShell, the admin key with its rights; BOM and CRLF; rollback', () => {
  const plain = adminScript({ gitShell: GIT_SH, adminKeyLine: null, keyBlob: 'AAAAkey' });
  assert.ok(plain.startsWith('\uFEFF#'));
  assert.ok(plain.endsWith('\r\n'));
  assert.match(plain, /Add-WindowsCapability -Online -Name 'OpenSSH\.Server~~~~0\.0\.1\.0'/);
  assert.match(plain, /Set-Service -Name sshd -StartupType Automatic\r\nStart-Service sshd/);
  assert.match(plain, /-Name DefaultShell -Value 'C:\\Program Files\\Git\\bin\\sh\.exe'/);
  assert.ok(!plain.includes('administrators_authorized_keys'), 'a plain user keeps ~/.ssh/authorized_keys');
  assert.ok([...plain].every((ch) => ch.charCodeAt(0) < 128 || ch === '\uFEFF'), 'ASCII only: PowerShell 5.1 reads it as is');
  const admin = adminScript({ gitShell: GIT_SH, adminKeyLine: authorizedLine(PUB), keyBlob: 'AAAAC3NzaC1lZDI1NTE5AAAAIKitKey' });
  assert.match(admin, /administrators_authorized_keys/);
  assert.match(admin, /-notlike '\*AAAAC3NzaC1lZDI1NTE5AAAAIKitKey\*'/);
  assert.ok(admin.includes(`'${authorizedLine(PUB)}'`));
  assert.match(admin, /icacls \$f \/inheritance:r \/grant 'Administrators:F' \/grant 'SYSTEM:F'/);
  const undo = adminRollbackScript({ gitShell: GIT_SH, keyBlob: 'AAAAkey' });
  assert.match(undo, /if \(\$d -eq 'C:\\Program Files\\Git\\bin\\sh\.exe'\) \{ Remove-ItemProperty/);
  assert.match(undo, /-notlike '\*AAAAkey\*'/);
  assert.ok(!undo.includes('Uninstall') && !undo.includes('Stop-Service'), 'sshd stays: the user installed it');
});

const winDeps = (m: Machine, admin: boolean | null = false) => ({ ...deps(m), nodeDir: 'C:\\n', gitShell: async () => GIT_SH, windowsAdmin: async () => admin });

test('win32, plain user: preview, write, needs-admin-setup, connection, removal with a rollback script', async () => {
  const m = await machine('win32');
  try {
    m.world.ps.facts = facts();
    const shared = createSharedAccess(m.rt, winDeps(m));
    assert.equal((await shared.state(true)).state, 'not-configured');
    const preview = await shared.preview();
    assert.deepEqual(preview.writes.map((w) => path.basename(w.file)), ['wfk_local', 'authorized_keys', 'config', '.bash_profile', 'shared-access-admin.ps1']);
    assert.ok(preview.notes.some((note) => note.includes('от имени администратора') && note.includes('-ExecutionPolicy Bypass')));
    assert.ok(preview.notes.some((note) => note.startsWith('DefaultShell')));
    assert.ok(!preview.notes.some((note) => note.includes('Удалённый вход')));

    const applied = await shared.apply(preview.token);
    assert.equal(applied.state, 'needs-admin-setup');
    assert.equal(applied.configured, true);
    assert.equal(applied.admin?.purpose, 'setup');
    assert.equal(applied.admin?.file, path.join(m.data, 'shared-access-admin.ps1'));
    assert.match(applied.admin?.command ?? '', /-File ".*shared-access-admin\.ps1"$/);
    assert.ok(applied.admin?.text.startsWith('# Workflow Kit'), 'the text is shown without the BOM');
    assert.match(applied.reason ?? '', /служба sshd не установлена/);
    assert.match(await readFile(path.join(m.home, '.bash_profile'), 'utf8'), /export PATH="\/u\/bin:\/c\/n:\$PATH"/);
    assert.equal(await readFile(path.join(m.home, '.ssh', 'authorized_keys'), 'utf8'), `${authorizedLine(PUB)}\n`);
    assert.deepEqual((await shared.preview()).writes, [], 'a second setup has nothing to write');

    m.world.ps.facts = facts(ready);
    const waiting = await shared.state(true);
    assert.equal(waiting.state, 'needs-connection', waiting.hint ?? '');
    m.world.ps.facts = facts({ ...ready, processes: [CONNECTION] });
    const active = await shared.state(true);
    assert.equal(active.state, 'active');
    assert.equal(active.connected, true);

    await assert.rejects(shared.open('remote-login'), { code: 'not-supported' });
    await shared.open('connections');
    assert.ok(m.world.ps.scripts.some((script) => script.includes('shell:AppsFolder') && script.includes(CONNECTIONS_LINK)));
    assert.ok(!m.calls.includes('open'));

    const removed = await shared.remove();
    assert.equal(removed.state, 'not-configured');
    assert.equal(removed.admin?.purpose, 'rollback');
    assert.match(removed.admin?.text ?? '', /Remove-ItemProperty/);
    await assert.rejects(stat(path.join(m.data, 'shared-access-admin.ps1')));
    assert.equal(await readFile(path.join(m.home, '.ssh', 'authorized_keys'), 'utf8'), '');
    assert.equal(await readFile(path.join(m.home, '.bash_profile'), 'utf8'), '');

    await shared.apply((await shared.preview()).token);
    await assert.rejects(stat(path.join(m.data, 'shared-access-admin-undo.ps1')), 'a new setup drops the rollback');
  } finally {
    await m.close();
  }
});

test('win32, administrator: the key goes into the script, a denied key needs the script again', async () => {
  const m = await machine('win32');
  try {
    m.world.ps.facts = facts(ready);
    m.world.ps.admin = 'True';
    // The default administrator check: whoami /groups through PowerShell.
    const shared = createSharedAccess(m.rt, { ...winDeps(m), windowsAdmin: undefined });
    const preview = await shared.preview();
    assert.ok(!preview.writes.some((w) => path.basename(w.file) === 'authorized_keys'));
    assert.ok(preview.notes.some((note) => note.includes('любого администратора')));
    m.world.ssh = { code: 255, stdout: '', stderr: 'Permission denied (publickey).\n' };
    const applied = await shared.apply(preview.token);
    assert.equal(applied.state, 'needs-admin-setup');
    assert.match(applied.reason ?? '', /administrators_authorized_keys/);
    const script = await readFile(path.join(m.data, 'shared-access-admin.ps1'), 'utf8');
    assert.ok(script.includes(authorizedLine(PUB)));
    assert.match(script, /icacls/);
    await assert.rejects(stat(path.join(m.home, '.ssh', 'authorized_keys')));
  } finally {
    await m.close();
  }
});

test('win32 without Git for Windows or the app: unsupported, the preview refuses', async () => {
  const m = await machine('win32');
  try {
    m.world.ps.facts = facts();
    const noGit = createSharedAccess(m.rt, { ...winDeps(m), gitShell: async () => null });
    const state = await noGit.state(true);
    assert.equal(state.state, 'unsupported');
    assert.match(state.reason ?? '', /Git for Windows/);
    await assert.rejects(noGit.preview(), { code: 'git-missing' });
    m.world.ps.facts = facts({ app: '' });
    assert.match((await createSharedAccess(m.rt, winDeps(m)).state(true)).reason ?? '', /приложение ChatGPT/);
  } finally {
    await m.close();
  }
});
