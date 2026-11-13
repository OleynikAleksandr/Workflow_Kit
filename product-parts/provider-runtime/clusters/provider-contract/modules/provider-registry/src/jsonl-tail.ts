import { open } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';

export const JSONL_BLOCK_BYTES = 1024 * 1024;
export const JSONL_MAX_BYTES = 256 * JSONL_BLOCK_BYTES;
export type JsonlSelectors<T> = { [K in keyof T]: (record: unknown) => T[K] | undefined };
interface Entry<T> { ino: number; dev: number; size: number; mtime: number; offset: number; values: Partial<T> }

/** A reader owns its selectors/cache; effective values survive a sparse appended tail. */
export function createJsonlTail<T extends object>(selectors: JsonlSelectors<T>, options: { blockBytes?: number; maxBytes?: number } = {}) {
  const cache = new Map<string, Entry<T>>();
  const block = options.blockBytes ?? JSONL_BLOCK_BYTES;
  const max = options.maxBytes ?? JSONL_MAX_BYTES;
  if (!Number.isSafeInteger(block) || block < 1 || !Number.isSafeInteger(max) || max < block) throw new Error('Invalid JSONL bounds');
  const keys = Object.keys(selectors) as (keyof T)[];
  function apply(line: Buffer, values: Partial<T>, newest: boolean): void {
    let record: unknown;
    try { record = JSON.parse(line.toString('utf8')); } catch { return; }
    for (const key of keys) {
      if (newest && Object.hasOwn(values, key)) continue;
      const value = selectors[key](record);
      if (value !== undefined) values[key] = value;
    }
  }
  async function bytes(file: FileHandle, from: number, length: number): Promise<Buffer> {
    const b = Buffer.alloc(length);
    const { bytesRead } = await file.read(b, 0, length, from);
    return b.subarray(0, bytesRead);
  }
  return {
    clear(file?: string): void { if (file) cache.delete(file); else cache.clear(); },
    async read(filePath: string): Promise<Partial<T>> {
      let file: FileHandle;
      try { file = await open(filePath, 'r'); } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') { cache.delete(filePath); return {}; }
        throw error;
      }
      try {
        const stat = await file.stat();
        const old = cache.get(filePath);
        const warm = old && old.ino === stat.ino && old.dev === stat.dev && stat.size >= old.size
          && (stat.size !== old.size || stat.mtimeMs === old.mtime);
        const entry: Entry<T> = { ino: stat.ino, dev: stat.dev, size: stat.size, mtime: stat.mtimeMs, offset: 0, values: {} };
        if (warm) {
          entry.offset = old.offset;
          entry.values = { ...old.values };
          let carry: Buffer = Buffer.alloc(0);
          let position = old.offset;
          while (position < stat.size) {
            const chunk = await bytes(file, position, Math.min(block, stat.size - position));
            if (!chunk.length) break;
            const start = position - carry.length;
            const data = Buffer.concat([carry, chunk]);
            let from = 0;
            for (let lf = data.indexOf(10); lf >= 0; lf = data.indexOf(10, from)) {
              apply(data.subarray(from, lf), entry.values, false);
              from = lf + 1;
              entry.offset = start + from;
            }
            carry = data.subarray(from);
            position += chunk.length;
          }
        } else {
          let position = stat.size;
          const floor = Math.max(0, stat.size - max);
          let carry: Buffer = Buffer.alloc(0);
          let boundaryFound = false;
          while (position > floor) {
            const start = Math.max(floor, position - block);
            let chunk = await bytes(file, start, position - start);
            if (!boundaryFound) {
              const lf = chunk.lastIndexOf(10);
              if (lf < 0) { position = start; continue; }
              entry.offset = start + lf + 1;
              chunk = chunk.subarray(0, lf);
              boundaryFound = true;
            }
            const data = Buffer.concat([chunk, carry]);
            let end = data.length;
            for (let lf = data.lastIndexOf(10, end - 1); lf >= 0; lf = end ? data.lastIndexOf(10, end - 1) : -1) {
              apply(data.subarray(lf + 1, end), entry.values, true);
              end = lf;
            }
            carry = data.subarray(0, end);
            position = start;
            if (position === 0) apply(carry, entry.values, true);
            if (keys.every(key => Object.hasOwn(entry.values, key))) break;
          }
        }
        cache.set(filePath, entry);
        return { ...entry.values };
      } finally { await file.close(); }
    },
  };
}
