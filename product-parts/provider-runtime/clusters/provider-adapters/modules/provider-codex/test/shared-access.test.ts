// Shared access to the ChatGPT chats (spec M12 section 2.2) on a fake runtime: a temporary HOME,
// fake ssh, ssh-keygen, ps and open; the platform is injected, so every branch runs on every OS.
import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import type { SharedAccessState } from '#provider-registry';
import { createSharedAccess, unsupportedReason } from '../src/shared-access.ts';
import {
  BLOCK_BEGIN,
  KEY_FROM,
  authorizedLine,
  isSharedConnection,
  managedBlock,
  parseSshCheck,
  profileBlock,
  profileFiles,
  removeManagedBlock,
  removeManualHost,
  removeProbeProfile,
  sshConfigBlock,
  upsertManagedBlock,
  withAuthorizedKey,
  withoutAuthorizedKey,
} from '../src/shared-files.ts';
import { PUB, deps, machine } from './shared-machine.ts';

const PROBE_PUB = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKitKey wfk-local probe';
const PROBE_HOST = '\nHost wfk-local\n  HostName 127.0.0.1\n  User u\n  IdentityFile ~/.ssh/wfk_local\n  IdentitiesOnly yes\n';
const PROBE_PROFILE = '\n# Workflow Kit probe: SSH sessions reuse the running Codex daemon\nif [ -n "$SSH_CONNECTION" ]; then\n  export PATH="$HOME/.npm-global/bin:$PATH"\n  export CODEX_SSH_SKIP_APP_SERVER_BOOT=true\nfi\n';
const CONNECTION = '  4242 /usr/bin/ssh -o BatchMode=yes wfk-local codex app-server proxy';

test('managed blocks: upsert is idempotent, removal restores the text', () => {
  const block = sshConfigBlock('u');
  const base = 'Host other\n  User x\n';
  const once = upsertManagedBlock(base, block, 'start');
  assert.ok(once.startsWith(BLOCK_BEGIN));
  assert.equal(upsertManagedBlock(once, block, 'start'), once);
  assert.equal(removeManagedBlock(once), base);
  const end = upsertManagedBlock('export A=1\n', profileBlock(['/bin/x']), 'end');
  assert.equal(upsertManagedBlock(end, profileBlock(['/bin/x']), 'end'), end);
  assert.equal(removeManagedBlock(end), 'export A=1\n');
  assert.equal(managedBlock('no block'), null);
});

test('hand-written probe blocks are found and removed; other hosts stay', () => {
  const config = `Host a\n  User a\n${PROBE_HOST}\nHost b\n  User b\n`;
  const manual = removeManualHost(config);
  assert.equal(manual.found, true);
  assert.equal(manual.text, 'Host a\n  User a\n\nHost b\n  User b\n');
  assert.equal(removeManualHost('Host a\n').found, false);
  const kept = upsertManagedBlock('', sshConfigBlock('u'), 'start');
  assert.equal(removeManualHost(kept).text, kept, 'the managed Host stays');
  const profile = removeProbeProfile(`export A=1\n${PROBE_PROFILE}`);
  assert.equal(profile.found, true);
  assert.equal(profile.text, 'export A=1\n');
});

test('authorized_keys: one line of the key, only from this computer; removal drops it', () => {
  const text = `ssh-rsa AAAAother me@x\n${PROBE_PUB}\n`;
  const next = withAuthorizedKey(text, PUB);
  assert.equal(next, `ssh-rsa AAAAother me@x\n${authorizedLine(PUB)}\n`);
  assert.ok(authorizedLine(PUB).startsWith(KEY_FROM));
  assert.equal(withAuthorizedKey(next, PUB), next);
  assert.equal(withoutAuthorizedKey(next, 'AAAAC3NzaC1lZDI1NTE5AAAAIKitKey'), 'ssh-rsa AAAAother me@x\n');
  assert.equal(withoutAuthorizedKey(next, null), 'ssh-rsa AAAAother me@x\n');
});

test('profile block: local SSH only, quoted dirs; zsh is edited, other shells are manual', () => {
  const block = profileBlock(['/a b/bin', '/a b/bin', '/opt/$x']);
  assert.match(block, /"127\.0\.0\.1 "\*\|"::1 "\*\)/);
  assert.match(block, /export PATH="\/a b\/bin:\/opt\/\\\$x:\$PATH"/);
  assert.match(block, /CODEX_SSH_SKIP_APP_SERVER_BOOT=true/);
  assert.deepEqual(profileFiles('/bin/zsh', '/h'), [path.join('/h', '.zshenv')]);
  assert.deepEqual(profileFiles('/bin/bash', '/h'), [path.join('/h', '.bash_profile')], 'bash without a profile gets ~/.bash_profile');
  assert.deepEqual(profileFiles('/bin/bash', '/h', (file) => file.endsWith('.profile')), [path.join('/h', '.profile')]);
  assert.equal(profileFiles('/usr/local/bin/fish', '/h'), null);
  assert.equal(profileFiles(null, '/h'), null);
});

test('connection and ssh answers are parsed; only Linux is unsupported', () => {
  assert.equal(isSharedConnection(CONNECTION), true);
  assert.equal(isSharedConnection('  1 /usr/bin/ssh wfk-local ls'), false);
  assert.equal(isSharedConnection('  1 codex app-server proxy'), false);
  assert.deepEqual(parseSshCheck('/u/bin/codex|true\n'), { codex: '/u/bin/codex', skip: true });
  assert.deepEqual(parseSshCheck('|\n'), { codex: null, skip: false });
  assert.equal(unsupportedReason('darwin'), null);
  assert.match(unsupportedReason('linux') ?? '', /Linux/);
  assert.equal(unsupportedReason('win32'), null, 'Windows is checked (M13)');
});

test('setup on macOS: preview, write with copies, checks through every state, idempotent, removal', async () => {
  const m = await machine();
  try {
    const ssh = path.join(m.home, '.ssh');
    await mkdir(ssh, { recursive: true });
    await writeFile(path.join(ssh, 'config'), `Host a\n  User a\n${PROBE_HOST}`);
    await writeFile(path.join(ssh, 'authorized_keys'), 'ssh-rsa AAAAother me@x\n');
    await writeFile(path.join(m.home, '.zshenv'), `export A=1\n${PROBE_PROFILE}`);
    const shared = createSharedAccess(m.rt, deps(m));

    assert.equal((await shared.state(true)).state, 'not-configured');
    const preview = await shared.preview();
    assert.deepEqual(preview.writes.map((w) => path.basename(w.file)), ['wfk_local', 'authorized_keys', 'config', '.zshenv']);
    assert.ok(preview.notes.some((note) => note.includes('вручную')), 'the hand-written Host is reported');
    assert.ok(preview.notes.some((note) => note.includes('блок пробы')));
    await assert.rejects(shared.apply('forged'), { code: 'invalid-token' });

    const applied = await shared.apply((await shared.preview()).token);
    assert.equal(applied.state, 'needs-connection');
    assert.equal(applied.configured, true);
    const config = await readFile(path.join(ssh, 'config'), 'utf8');
    assert.ok(config.startsWith(BLOCK_BEGIN));
    assert.equal(config.match(/Host wfk-local/g)?.length, 1, 'the probe stanza is replaced');
    assert.match(config, /Host a\n {2}User a/);
    assert.equal(await readFile(path.join(ssh, 'authorized_keys'), 'utf8'), `ssh-rsa AAAAother me@x\n${authorizedLine(PUB)}\n`);
    const zshenv = await readFile(path.join(m.home, '.zshenv'), 'utf8');
    assert.ok(!zshenv.includes('Workflow Kit probe'));
    assert.match(zshenv, /export PATH="\/u\/bin:\/n\/bin:\$PATH"/);
    // POSIX permissions exist only on a POSIX host file system (Windows reports 0666); the
    // product writes these files only on macOS.
    if (process.platform !== 'win32') assert.equal((await stat(path.join(ssh, 'authorized_keys'))).mode & 0o777, 0o600);
    assert.ok((await readdir(path.join(path.dirname(m.home), 'data', 'backups'))).length >= 3, 'copies before the write');
    assert.deepEqual((await shared.preview()).writes, [], 'a second setup has nothing to write');

    m.world.port = false;
    assert.equal((await shared.state(true)).state, 'needs-remote-login');
    m.world.port = true;
    m.world.ssh = { code: 255, stdout: '', stderr: 'Permission denied (publickey).\n' };
    const broken = await shared.state(true);
    assert.equal(broken.state, 'broken');
    assert.match(broken.reason ?? '', /Permission denied/);
    m.world.ssh = { code: 0, stdout: '/u/bin/codex|\n', stderr: '' };
    assert.match((await shared.state(true)).reason ?? '', /CODEX_SSH_SKIP_APP_SERVER_BOOT/);
    m.world.ssh = { code: 0, stdout: '/u/bin/codex|true\n', stderr: '' };

    m.world.listing = `  1 /sbin/launchd\n${CONNECTION}\n`;
    const active = await shared.state(true);
    assert.equal(active.state, 'active');
    assert.equal(active.connected, true);
    m.world.listing = '';
    const closed: SharedAccessState = await shared.state(true);
    assert.equal(closed.state, 'active', 'once seen, a closed app keeps the state');
    assert.equal(closed.connected, false);
    assert.equal(shared.cached()?.state, 'active');
    assert.equal(await shared.state(false), shared.cached(), 'state(false) reuses the last check');

    const stale = await shared.preview();
    await writeFile(path.join(ssh, 'config'), `${config}\nHost c\n`);
    await assert.rejects(shared.apply(stale.token), { code: 'preview-stale' });

    const removed = await shared.remove();
    assert.equal(removed.state, 'not-configured');
    assert.equal(managedBlock(await readFile(path.join(ssh, 'config'), 'utf8')), null);
    assert.equal(await readFile(path.join(ssh, 'authorized_keys'), 'utf8'), 'ssh-rsa AAAAother me@x\n');
    assert.equal(await readFile(path.join(m.home, '.zshenv'), 'utf8'), 'export A=1\n');
    await assert.rejects(stat(path.join(ssh, 'wfk_local')));
    await shared.open('connections');
    assert.ok(m.calls.includes('open'));
  } finally {
    await m.close();
  }
});

test('bash: the login profile gets the block', async () => {
  const m = await machine();
  try {
    await writeFile(path.join(m.home, '.profile'), 'export B=1\n');
    const shared = createSharedAccess(m.rt, { ...deps(m), loginShell: () => '/bin/bash' });
    await shared.apply((await shared.preview()).token);
    assert.match(await readFile(path.join(m.home, '.profile'), 'utf8'), /^export B=1\n\n# >>> workflow-kit >>>/);
    await assert.rejects(stat(path.join(m.home, '.bash_profile')), 'no new bash_profile hides ~/.profile');
  } finally {
    await m.close();
  }
});

test('a shell Kit does not edit gets the block to paste; the SSH check decides', async () => {
  const m = await machine();
  try {
    const shared = createSharedAccess(m.rt, { ...deps(m), loginShell: () => '/usr/local/bin/fish' });
    const preview = await shared.preview();
    assert.ok(!preview.writes.some((w) => w.file.endsWith('.zshenv') || w.file.includes('.bash')));
    const applied = await shared.apply(preview.token);
    assert.ok(applied.manualProfile?.includes('CODEX_SSH_SKIP_APP_SERVER_BOOT'));
    m.world.ssh = { code: 0, stdout: '|\n', stderr: '' };
    assert.equal((await shared.state(true)).state, 'broken');
  } finally {
    await m.close();
  }
});

test('linux: shared access is unsupported and writes nothing', async () => {
  const m = await machine('linux');
  try {
    const shared = createSharedAccess(m.rt, deps(m));
    const state = await shared.state(true);
    assert.equal(state.state, 'unsupported');
    assert.ok(state.reason);
    await assert.rejects(shared.preview(), { code: 'not-supported' });
    await assert.rejects(shared.apply('x'), { code: 'not-supported' });
    await assert.rejects(shared.remove(), { code: 'not-supported' });
    await assert.rejects(shared.open('connections'), { code: 'not-supported' });
    assert.deepEqual(m.calls, []);
  } finally {
    await m.close();
  }
});

test('macOS without the ChatGPT app or codex: unsupported with a hint', async () => {
  const m = await machine();
  try {
    assert.match((await createSharedAccess(m.rt, { ...deps(m), appInstalled: async () => false }).state(true)).reason ?? '', /ChatGPT/);
    (m.rt.program as { installed: boolean }).installed = false;
    assert.match((await createSharedAccess(m.rt, deps(m)).state(true)).reason ?? '', /codex/);
  } finally {
    await m.close();
  }
});
