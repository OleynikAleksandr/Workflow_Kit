// Fake machine of the shared access tests: a temporary HOME and data directory, fake ssh,
// ssh-keygen, ps, open and PowerShell; the platform is injected, so every branch runs on every OS.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createTokenStore } from '#provider-registry';
import type { CodexRuntime } from '../src/runtime.ts';

export const PUB = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKitKey workflow-kit';

/** PowerShell of a Windows machine: the probe facts (JSON), the admin answer, scripts it ran. */
export interface FakePowerShell {
  facts: string | null;
  admin: 'True' | 'False' | null;
  scripts: string[];
}

export interface Machine {
  home: string;
  data: string;
  calls: string[];
  world: { port: boolean; ssh: { code: number; stdout: string; stderr: string }; listing: string; ps: FakePowerShell };
  rt: CodexRuntime;
  close(): Promise<void>;
}

export async function machine(platform: NodeJS.Platform = 'darwin'): Promise<Machine> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wfk-shared-'));
  const home = path.join(root, 'home');
  const data = path.join(root, 'data');
  await mkdir(home, { recursive: true });
  const calls: string[] = [];
  const bin = path.join(root, 'bin');
  await mkdir(bin, { recursive: true });
  // Windows: ssh.exe on PATH, found by findProgram.
  if (platform === 'win32') await writeFile(path.join(bin, 'ssh.exe'), '');
  const world = {
    port: true,
    ssh: { code: 0, stdout: '/u/bin/codex|true\n', stderr: '' },
    listing: '  1 /sbin/launchd\n',
    ps: { facts: null, admin: 'False', scripts: [] } as FakePowerShell,
  };
  const ok = (stdout: string) => ({ code: 0, stdout, stderr: '', timedOut: false });
  const rt = {
    context: {
      platform,
      homedir: home,
      env: platform === 'win32' ? { PATH: bin } : {},
      dirs: { configDir: data, stateDir: data, appDir: data, logsDir: data, backupsDir: path.join(data, 'backups'), overridden: true },
      now: () => new Date('2026-11-11T10:00:00Z'),
      log: () => undefined,
      runCommand: async (command: string, args: string[]) => {
        calls.push(command);
        if (command === 'ssh-keygen') {
          const file = args[args.indexOf('-f') + 1]!;
          await writeFile(file, 'PRIVATE\n', { mode: 0o600 });
          await writeFile(`${file}.pub`, `${PUB}\n`);
          return ok('');
        }
        if (command === 'ssh') return { ...world.ssh, timedOut: false };
        if (command === 'ps') return ok(world.listing);
        if (command === 'powershell.exe') {
          const script = args[args.length - 1]!;
          world.ps.scripts.push(script);
          const answer = script.includes('whoami') ? world.ps.admin : script.includes('Get-Service sshd') ? world.ps.facts : '';
          return answer === null ? { code: 1, stdout: '', stderr: 'failed', timedOut: false } : ok(answer);
        }
        return ok('');
      },
    },
    program: { installed: true, path: '/u/bin/codex', unsupported: null },
    tokens: createTokenStore(),
  } as unknown as CodexRuntime;
  return { home, data, calls, world, rt, close: () => rm(root, { recursive: true, force: true }) };
}

export const deps = (m: Machine) => ({
  probePort: async () => m.world.port,
  loginShell: () => '/bin/zsh',
  userName: () => 'u',
  appInstalled: async () => true,
  nodeDir: '/n/bin',
});
