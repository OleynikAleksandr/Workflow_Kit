import { readFile } from 'node:fs/promises';
import os from 'node:os';
import { tailscaleAddresses } from '#http-server';
import type { InterfaceMap } from '#http-server';

/** Operating system description for the "System" card. */
export interface OsInfo {
  platform: NodeJS.Platform;
  /** macOS, Linux distribution name or Windows. */
  name: string;
  /** Product version (macOS 15.1, Ubuntu 24.04) or kernel release when unknown. */
  version: string;
  arch: string;
  /** Kernel release (os.release()). */
  release: string;
  /** Ready-to-show text, e.g. "macOS 15.1 (arm64)". */
  label: string;
}

/** Inputs of detectOs; injected for tests. */
export interface DetectOsInput {
  platform: NodeJS.Platform;
  arch: string;
  release: string;
  /** os.version() text, used on Windows. */
  osVersion: string;
  /** Reads a text file; rejects when it is missing. */
  readText: (file: string) => Promise<string>;
}

/** Default inputs of detectOs for the current machine. */
export function currentOsInput(): DetectOsInput {
  return {
    platform: process.platform,
    arch: process.arch,
    release: os.release(),
    osVersion: os.version(),
    readText: (file) => readFile(file, 'utf8'),
  };
}

async function tryRead(input: DetectOsInput, file: string): Promise<string> {
  try {
    return await input.readText(file);
  } catch {
    return '';
  }
}

/** Detects the OS name and version from system files (no external programs, D11). */
export async function detectOs(input: DetectOsInput): Promise<OsInfo> {
  let name: string;
  let version = '';
  if (input.platform === 'darwin') {
    name = 'macOS';
    const plist = await tryRead(input, '/System/Library/CoreServices/SystemVersion.plist');
    version = /<key>ProductVersion<\/key>\s*<string>([^<]+)<\/string>/.exec(plist)?.[1]?.trim() ?? '';
  } else if (input.platform === 'win32') {
    name = 'Windows';
    version = input.osVersion.replace(/^Windows\s*/i, '').trim();
  } else if (input.platform === 'linux') {
    const release = await tryRead(input, '/etc/os-release');
    const pretty = /^PRETTY_NAME=(?:"([^"]*)"|(.*))$/m.exec(release);
    name = (pretty?.[1] ?? pretty?.[2] ?? '').trim() || 'Linux';
  } else {
    name = input.platform;
  }
  if (!version && name === 'macOS') version = `Darwin ${input.release}`;
  else if (!version && (name === 'Linux' || name === input.platform)) version = input.release;
  const label = `${[name, version].filter(Boolean).join(' ')} (${input.arch})`;
  return { platform: input.platform, name, version, arch: input.arch, release: input.release, label };
}

/** Panel URLs of this machine: loopback plus every Tailscale address. */
export function panelUrls(port: number, interfaces: InterfaceMap): string[] {
  const hosts = ['127.0.0.1', ...tailscaleAddresses(interfaces).map((a) => (a.includes(':') ? `[${a}]` : a))];
  return hosts.map((host) => `http://${host}:${port}/`);
}

/** Reads the version field of the package.json next to bin/ and product-parts/. */
export async function readPackageVersion(): Promise<string> {
  const file = new URL('../../../../../../../package.json', import.meta.url);
  const pkg = JSON.parse(await readFile(file, 'utf8')) as { version?: unknown };
  return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
}
