// The Remote Control id of a session from its transcript (transcript_path of the hook journal):
// a JSON line {"type":"bridge-session","bridgeSessionId":"cse_<X>"}. Transcripts only grow, so each
// file is scanned incrementally from where the previous poll stopped (D11: polls stay cheap); the
// transcript directory is never computed here, only paths given by the hook are read.
import { open, stat } from 'node:fs/promises';
import path from 'node:path';
import { normalizeRemoteId } from './links.ts';

/** Bytes read per chunk. */
const CHUNK = 1024 * 1024;
/** A line longer than this cannot be a bridge-session record and is skipped. */
const MAX_LINE = 1024 * 1024;

interface ScanState {
  ino: number;
  offset: number;
  carry: string;
  skipping: boolean;
  remoteId: string | null;
  /** Kept across calls: a character split between two reads is decoded once both halves are in. */
  decoder: TextDecoder;
}

/** Reads bridge-session ids from transcripts. */
export interface BridgeReader {
  /** session_<X> of the latest bridge-session record, or null (no record, no file, bad path). */
  remoteIdOf(transcriptPath: string | null): Promise<string | null>;
  clear(): void;
}

/** Extracts the id from one transcript line; null when it is not a bridge-session record. */
export function bridgeIdOfLine(line: string): string | null {
  if (!line.includes('bridge-session')) return null;
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Record<string, unknown>;
  if (row['type'] !== 'bridge-session') return null;
  return normalizeRemoteId(row['bridgeSessionId']) ?? normalizeRemoteId(row['sessionId']);
}

/** Creates a reader; maxBytesPerCall bounds the work of one call (the rest is read next time). */
export function createBridgeReader(options: { maxBytesPerCall?: number; maxFiles?: number } = {}): BridgeReader {
  const maxBytes = options.maxBytesPerCall ?? 64 * 1024 * 1024;
  const maxFiles = options.maxFiles ?? 500;
  const states = new Map<string, ScanState>();

  function consume(state: ScanState, text: string): void {
    let data = state.carry + text;
    state.carry = '';
    for (;;) {
      const newline = data.indexOf('\n');
      if (newline < 0) break;
      const line = data.slice(0, newline);
      data = data.slice(newline + 1);
      if (state.skipping) {
        state.skipping = false;
        continue;
      }
      const id = bridgeIdOfLine(line);
      if (id) state.remoteId = id;
    }
    if (data.length > MAX_LINE) state.skipping = true;
    else if (!state.skipping) state.carry = data;
  }

  async function scan(transcriptPath: string): Promise<string | null> {
    let info;
    try {
      info = await stat(transcriptPath);
    } catch {
      return null;
    }
    if (!info.isFile()) return null;
    let state = states.get(transcriptPath);
    if (!state || state.ino !== info.ino || info.size < state.offset) {
      state = { ino: info.ino, offset: 0, carry: '', skipping: false, remoteId: null, decoder: new TextDecoder('utf-8') };
    }
    states.delete(transcriptPath);
    states.set(transcriptPath, state);
    if (states.size > maxFiles) states.delete(states.keys().next().value!);
    if (info.size === state.offset) return state.remoteId;
    const handle = await open(transcriptPath, 'r');
    try {
      const end = Math.min(info.size, state.offset + maxBytes);
      const buffer = Buffer.alloc(Math.min(CHUNK, end - state.offset));
      while (state.offset < end) {
        const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, end - state.offset), state.offset);
        if (bytesRead === 0) break;
        state.offset += bytesRead;
        consume(state, state.decoder.decode(buffer.subarray(0, bytesRead), { stream: true }));
      }
    } finally {
      await handle.close();
    }
    return state.remoteId;
  }

  /** One scan per file at a time: concurrent polls wait for the running one. */
  const running = new Map<string, Promise<string | null>>();
  return {
    remoteIdOf(transcriptPath) {
      if (!transcriptPath || !path.isAbsolute(transcriptPath) || !transcriptPath.endsWith('.jsonl')) return Promise.resolve(null);
      const active = running.get(transcriptPath);
      if (active) return active;
      const result = scan(transcriptPath).finally(() => running.delete(transcriptPath));
      running.set(transcriptPath, result);
      return result;
    },
    clear: () => states.clear(),
  };
}
