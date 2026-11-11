// Codex sessions in the shared daemon mode (spec M12 section 2.3) on the fake machine: the setup
// is applied in the fake HOME (ssh, ssh-keygen and ps are fakes), then the mode turns on and off.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { after, before } from 'node:test';
import { runCommand } from '#process-supervisor';
import type { CommandRunner } from '#process-supervisor';
import type { Project, Provider } from '#provider-registry';
import { createCodexProvider } from '../src/index.ts';
import type { FakeDaemon } from './fake-daemon.ts';
import { POSIX_MACHINE_SKIP, fakeMachine, machineTest as test } from './helpers.ts';
import type { FakeMachine } from './helpers.ts';

const APP_SERVER = '  200 /Applications/ChatGPT.app/Contents/Resources/codex app-server --analytics-default-enabled';
const CONNECTION = '  300 /usr/bin/ssh -T -o BatchMode=yes wfk-local sh -c codex app-server proxy';
const SECOND = '  400 /Users/u/bin/codex -c features.code_mode_host=true app-server --listen unix://';

let machine: FakeMachine;
let project: Project;
let daemon: FakeDaemon;
let provider: Provider;
const world = { listing: `${APP_SERVER}\n`, calls: [] as string[] };

before(async () => {
  if (POSIX_MACHINE_SKIP) return;
  machine = await fakeMachine();
  project = await machine.project('Shared');
  await writeFile(path.join(machine.codexHome, 'config.toml'), `[projects."${project.path}"]\ntrust_level = "trusted"\n`);
  daemon = await machine.daemon({ threadId: 'thread-shared' });
  const fake: CommandRunner = async (command, args, options) => {
    world.calls.push([command, ...args.slice(0, 2)].join(' '));
    const ok = (stdout: string) => ({ code: 0, stdout, stderr: '', timedOut: false, signal: null, startError: null });
    if (command === 'ps') return ok(world.listing);
    if (command === 'ssh') return ok(`${path.join(machine.bin, 'codex')}|true\n`);
    if (command === 'ssh-keygen') {
      const file = args[args.indexOf('-f') + 1]!;
      await writeFile(file, 'PRIVATE\n');
      await writeFile(`${file}.pub`, 'ssh-ed25519 AAAAkey workflow-kit\n');
      return ok('');
    }
    return runCommand(command, args, options);
  };
  provider = createCodexProvider(machine.context({ runCommand: fake }), {
    serviceTurnWaitMs: 100,
    daemonTtlMs: 0,
    releasePollMs: 10,
    handover: { waitMs: 0, sleep: async () => undefined },
    sharedAccess: { probePort: async () => true, loginShell: () => '/bin/zsh', userName: () => 'u', appInstalled: async () => true, nodeDir: '/n' },
  });
  await provider.refresh!();
});

after(async () => {
  await machine?.close();
});

const methods = (): string[] => daemon.calls.map((c) => c.method).filter((m) => m.startsWith('thread/') || m === 'turn/start');

test('outside the mode: the chat is unloaded, links have no hostId, wake is refused, the reviewer gets a first message', async () => {
  assert.equal((await provider.sharedAccess!.state(true)).state, 'not-configured');
  daemon.calls.length = 0;
  const session = await provider.createSession(project, { title: 'Shared · 1' });
  assert.equal(session.links.desktop, 'codex://threads/thread-shared');
  assert.ok(methods().includes('thread/loaded/list'), 'the old path waits for the release');
  assert.equal(await provider.wakeSession!(project, 'thread-shared'), false);
  assert.equal(provider.reviewBrief, 'first-message');
});

test('in the mode: no unload, hostId links, wake resumes the chat, remote control stays with the daemon', async () => {
  const shared = provider.sharedAccess!;
  await shared.apply((await shared.preview()).token);
  world.listing = `${APP_SERVER}\n${CONNECTION}\n`;
  assert.equal((await shared.state(true)).state, 'active');

  daemon.calls.length = 0;
  const session = await provider.createSession(project, { title: 'Shared · 2' });
  assert.equal(session.links.desktop, 'codex://threads/thread-shared?hostId=remote-ssh-discovered%3Awfk-local');
  assert.equal(session.links.mobile, 'codex://threads/thread-shared');
  assert.equal(session.note, undefined);
  assert.deepEqual(methods(), ['thread/start', 'thread/name/set', 'turn/start', 'thread/unsubscribe']);
  const listed = (await provider.listSessions(project)).find((s) => s.localId === 'thread-shared');
  assert.match(listed?.links.desktop ?? '', /hostId=/);

  daemon.calls.length = 0;
  assert.equal(await provider.wakeSession!(project, 'thread-shared'), true);
  assert.deepEqual(methods(), ['thread/loaded/list', 'thread/resume', 'turn/start', 'thread/unsubscribe']);

  world.calls.length = 0;
  await provider.maintain!();
  assert.ok(!world.calls.some((line) => line.includes('remote-control stop')), world.calls.join('\n'));
});

test('a second app-server of the app turns the mode off; it comes back by itself', async () => {
  world.listing = `${APP_SERVER}\n${CONNECTION}\n${SECOND}\n`;
  const broken = await provider.sharedAccess!.state(true);
  assert.equal(broken.state, 'broken');
  assert.match(broken.reason ?? '', /второй app-server/);
  assert.equal(await provider.wakeSession!(project, 'thread-shared'), false);
  world.listing = `${APP_SERVER}\n${CONNECTION}\n`;
  assert.equal((await provider.sharedAccess!.state(true)).state, 'active', 'the mode comes back by itself');
});
