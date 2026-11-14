import os from 'node:os';
import path from 'node:path';
import { mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { resolveDataDirs } from '#data-store';
import type { DataDirs } from '#data-store';
import { limitsFile, snapshotFile, readSnapshot, writeSnapshot } from '#provider-registry';
import { runStatuslineCommand } from './statusline-shell.ts';
import { resolveAutoCompactWindow } from './auto-compact-window.ts';
import type { AutoCompactDeps } from './auto-compact-window.ts';

export const STATUSLINE_MAX_INPUT = 1024 * 1024;
const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const pick = (v: unknown, fields: string[]) => Object.fromEntries(fields.filter(k => Object.hasOwn(object(v), k)).map(k => [k, object(v)[k]]));
export interface StatuslineDeps {
  platform?: NodeJS.Platform; env?: NodeJS.ProcessEnv; homedir?: string; cwd?: string;
  dirs?: DataDirs; input?: Buffer; write?: (bytes: Buffer) => void; now?: () => Date;
  execute?: typeof runStatuslineCommand;
}
/** Enforces the bound while reading, without decoding/re-encoding the original bytes. */
export async function readStatuslineInput(stream: Readable = process.stdin): Promise<Buffer> {
  return new Promise(resolve => {
    const chunks: Buffer[] = []; let size = 0;
    const finish = (value: Buffer) => { clearTimeout(timer); stream.off('data', data); stream.off('end', end); stream.off('error', error); stream.pause(); resolve(value); };
    const data = (chunk: Buffer | string) => { const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += b.length; if (size > STATUSLINE_MAX_INPUT) finish(Buffer.alloc(0)); else chunks.push(b); };
    const end = () => finish(Buffer.concat(chunks)); const error = () => finish(Buffer.alloc(0));
    const timer = setTimeout(() => finish(Buffer.alloc(0)), 2000);
    stream.on('data', data); stream.once('end', end); stream.once('error', error); stream.resume();
  });
}
export async function userStatusline(cwd: string, home: string): Promise<string | null> {
  for (const file of [path.join(cwd, '.claude', 'settings.local.json'), path.join(cwd, '.claude', 'settings.json'), path.join(home, '.claude', 'settings.json')]) {
    try {
      const value = object(JSON.parse(await readFile(file, 'utf8')));
      const line = object(value['statusLine']); const command = line['command'];
      if (line['type'] === 'command' && typeof command === 'string' && command.trim() && !/wfk(?:\.cmd|\.mjs)?["']?\s+statusline\b/i.test(command)) return command;
    } catch { /* Absent or malformed settings fall through to the next layer. */ }
  }
  return null;
}
async function saveLimits(file: string, value: Record<string, unknown>): Promise<void> {
  const lock = `${file}.lock`;
  let acquired = false;
  for (let i = 0; i < 100; i++) {
    try { await mkdir(lock); acquired = true; break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const info = await stat(lock).catch(() => null);
      if (info && Date.now() - info.mtimeMs > 10000) await rm(lock, { recursive: true, force: true });
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
  if (!acquired) return;
  try {
    const old = await readSnapshot<Record<string, unknown>>(file);
    if (!old || String(old['at']) <= String(value['at'])) await writeSnapshot(file, value);
  } finally { await rm(lock, { recursive: true, force: true }); }
}
async function capture(input: Buffer, client: string, dirs: DataDirs, platform: NodeJS.Platform, now: Date, where: AutoCompactDeps): Promise<void> {
  const value = object(JSON.parse(input.toString('utf8'))); const sid = value['session_id'];
  if (typeof sid !== 'string') return;
  const file = snapshotFile(dirs, client, sid, platform);
  const modelId = object(value['model'])['id'];
  // Claude's own threshold: /context and the app count against it, the statusline input does not carry it.
  const threshold = client === 'claude' ? await resolveAutoCompactWindow(typeof modelId === 'string' ? modelId : null, where).catch(() => null) : null;
  const context = { ...pick(value['context_window'], ['context_window_size', 'used_percentage', 'total_input_tokens']), ...(threshold ? { auto_compact_window: threshold.window, auto_compact_source: threshold.source } : {}) };
  const snapshot = { session_id: sid, model: pick(value['model'], ['id', 'display_name']), effort: pick(value['effort'], ['level']),
    context_window: context, fast_mode: value['fast_mode'], version: value['version'], at: now.toISOString() };
  await writeSnapshot(file, snapshot);
  if (value['rate_limits']) {
    const limits = object(value['rate_limits']);
    await saveLimits(limitsFile(dirs, client, platform), { at: now.toISOString(), rate_limits: Object.fromEntries(['five_hour', 'seven_day'].filter(k => limits[k]).map(k => [k, pick(limits[k], ['used_percentage', 'resets_at'])])) });
  }
  for (const name of await readdir(path.dirname(file))) {
    if (!/^[A-Za-z0-9_-]+\.json$/.test(name)) continue;
    const old = path.join(path.dirname(file), name);
    if ((await stat(old)).mtimeMs < now.getTime() - 30 * 86400000) await rm(old, { force: true });
  }
}
/** A broken snapshot/backend never interferes with the user's terminal line. */
export async function runStatusline(args: readonly string[], deps: StatuslineDeps = {}): Promise<number> {
  try {
    const platform = deps.platform ?? process.platform; const env = deps.env ?? process.env;
    const home = deps.homedir ?? os.homedir(); const cwd = deps.cwd ?? process.cwd();
    const input = deps.input ?? await readStatuslineInput();
    if (input.length > STATUSLINE_MAX_INPUT) return 0;
    const index = args.indexOf('--client'); const client = index >= 0 ? args[index + 1] : undefined;
    if (client && /^[A-Za-z0-9_-]{1,128}$/.test(client)) {
      const dirs = deps.dirs ?? resolveDataDirs({ platform, env, homedir: home });
      await capture(input, client, dirs, platform, (deps.now ?? (() => new Date()))(), { platform, env, cwd, homedir: home }).catch(() => undefined);
    }
    const command = await userStatusline(cwd, home);
    if (command) {
      const output = await (deps.execute ?? runStatuslineCommand)(command, input, { platform, env, cwd });
      (deps.write ?? (bytes => { process.stdout.write(bytes); }))(output);
    }
  } catch { /* Status line is best effort, always zero. */ }
  return 0;
}
