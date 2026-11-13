// Strict single-lock proof for destructive turn control; an unreadable directory is not idle.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { holderAlive, lockTime } from './locks.ts';
import type { Liveness } from './locks.ts';

export type TurnLock = { kind: 'idle'; signature: null } | { kind: 'own'; signature: string } | { kind: 'foreign' | 'unknown'; signature: null };
export async function turnLock(dir: string, id: string, pid: number, live: Liveness): Promise<TurnLock> {
  let value: unknown;
  try { value = JSON.parse(await readFile(path.join(dir, `${id}.lock`), 'utf8')); }
  catch (error) { return { kind: (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'idle' : 'unknown', signature: null }; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { kind: 'unknown', signature: null };
  const lock = value as Record<string, unknown>;
  if (lock['version'] !== 1 || typeof lock['hostname'] !== 'string' || typeof lock['pid'] !== 'number' || !Number.isInteger(lock['pid']) || lock['pid'] <= 0 || lockTime(lock['startedAt']) === null || typeof lock['token'] !== 'string' || !lock['token']) return { kind: 'unknown', signature: null };
  if (lock['hostname'] !== live.hostname()) return { kind: 'foreign', signature: null };
  if (!holderAlive({ pid: lock['pid'], startedAt: lock['startedAt'] }, live)) return { kind: 'idle', signature: null };
  if (lock['pid'] !== pid) return { kind: 'foreign', signature: null };
  return { kind: 'own', signature: JSON.stringify([lock['token'], lock['pid'], lockTime(lock['startedAt']), lock['hostname']]) };
}
