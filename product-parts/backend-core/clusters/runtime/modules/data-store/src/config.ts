import os from 'node:os';
import path from 'node:path';
import { readJsonFile } from './atomic.ts';
import type { DataDirs } from './paths.ts';

/** Default HTTP port of the backend. */
export const DEFAULT_PORT = 4747;

/** Contents of config.json after defaults and overrides are applied. */
export interface WfkConfig {
  /** HTTP port; WFK_PORT overrides the file. */
  port: number;
  /** Root folder for new projects. */
  projectsRoot: string;
  /** Absolute paths of external programs saved by install (D12); filled in later tasks. */
  programs: Record<string, string>;
}

/** Inputs of loadConfig; injected for tests. */
export interface LoadConfigInput {
  dirs: DataDirs;
  env: NodeJS.ProcessEnv;
  homedir?: string;
}

/** Error for a config value that cannot be used. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** Path of config.json inside the data directories. */
export function configFile(dirs: DataDirs): string {
  return path.join(dirs.configDir, 'config.json');
}

/** Parses a TCP port; 0 is allowed and means "any free port" (tests, dev instances). */
export function parsePort(value: unknown, source: string): number {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  const port = /^\d{1,5}$/.test(text) ? Number(text) : Number.NaN;
  if (!(port >= 0 && port <= 65535)) throw new ConfigError(`${source}: port must be an integer 0-65535`);
  return port;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads config.json (a missing file means defaults) and applies the WFK_PORT override. */
export async function loadConfig(input: LoadConfigInput): Promise<WfkConfig> {
  const home = input.homedir ?? os.homedir();
  const raw = await readJsonFile(configFile(input.dirs));
  const file = isRecord(raw) ? raw : {};
  let port = file['port'] === undefined ? DEFAULT_PORT : parsePort(file['port'], 'config.json');
  const envPort = input.env['WFK_PORT']?.trim();
  if (envPort) port = parsePort(envPort, 'WFK_PORT');
  const rawRoot = file['projectsRoot'];
  const projectsRoot = typeof rawRoot === 'string' && rawRoot !== '' ? rawRoot : path.join(home, 'WorkflowKitProjects');
  const programs: Record<string, string> = {};
  const rawPrograms = file['programs'];
  if (isRecord(rawPrograms)) {
    for (const [name, value] of Object.entries(rawPrograms)) {
      if (typeof value === 'string') programs[name] = value;
    }
  }
  return { port, projectsRoot, programs };
}
