// M29 3.3: the service side of wanted Claude parameters. The service is the only writer of
// <debug>.parameters-wanted (one lock per file); the host only reads it and reports statuses in
// its state. The native catalog is cached per CLI version in the service state folder.
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { ClaudeRuntime } from './runtime.ts';
import { readNativeJson, writeNativeJson } from './native-parameters.ts';
import { rm } from 'node:fs/promises';
import { PARAMETER_CATALOG, PARAMETER_WANTED, WANTED_ORDER, validCatalog, validWanted } from './pty/parameter-protocol.ts';
import type { NativeCatalog, NativeParameterState, NativeWanted, WantedField } from './pty/parameter-protocol.ts';

export const CATALOG_CACHE = 'claude-native-catalog.json';
const locks = new Map<string, Promise<unknown>>();

/** Runs one change of a wanted file after the previous one; a failure does not block the next. */
function locked<T>(debug: string, work: () => Promise<T>): Promise<T> {
  const previous = locks.get(debug) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(work);
  locks.set(debug, next);
  void next.finally(() => { if (locks.get(debug) === next) locks.delete(debug); }).catch(() => undefined);
  return next;
}

export async function readWanted(debug: string): Promise<NativeWanted | null> {
  const value = await readNativeJson(debug + PARAMETER_WANTED);
  return validWanted(value) ? value : null;
}
async function store(debug: string, wanted: NativeWanted): Promise<NativeWanted | null> {
  if (Object.keys(wanted.changes).length === 0) { await rm(debug + PARAMETER_WANTED, { force: true }); return null; }
  await writeNativeJson(debug + PARAMETER_WANTED, wanted);
  return wanted;
}

/** The user's choice: replaces the field's earlier choice with a new id. */
export function mergeWanted(debug: string, state: Pick<NativeParameterState, 'hostId' | 'sessionId'>, field: WantedField, value: string): Promise<NativeWanted | null> {
  return locked(debug, async () => {
    const old = await readWanted(debug);
    const same = old && old.hostId === state.hostId && old.sessionId === state.sessionId;
    const wanted: NativeWanted = { version: 1, hostId: state.hostId, sessionId: state.sessionId,
      changes: { ...(same ? old.changes : {}), [field]: value }, ids: { ...(same ? old.ids : {}), [field]: randomUUID() } };
    return store(debug, wanted);
  });
}

/** Drops a field: the user chose the confirmed value again. */
export function dropWanted(debug: string, field: WantedField): Promise<NativeWanted | null> {
  return locked(debug, async () => {
    const wanted = await readWanted(debug);
    if (!wanted || !(field in wanted.changes)) return wanted;
    delete wanted.changes[field]; delete wanted.ids[field];
    return store(debug, wanted);
  });
}

export interface Settled { field: WantedField; value: string; status: 'applied' | 'failed'; reason: string | null }
/**
 * Removes the fields the host has applied or failed (by id) and fields of another host or session.
 * Returns the wanted file that remains and what was settled.
 */
export function pruneWanted(debug: string, state: NativeParameterState): Promise<{ wanted: NativeWanted | null; settled: Settled[] }> {
  return locked(debug, async () => {
    const wanted = await readWanted(debug);
    if (!wanted) return { wanted: null, settled: [] };
    if (wanted.hostId !== state.hostId || wanted.sessionId !== state.sessionId) return { wanted: await store(debug, { ...wanted, changes: {}, ids: {} }), settled: [] };
    const settled: Settled[] = [];
    for (const field of WANTED_ORDER) {
      const status = state.wanted?.[field];
      if (!status || status.id !== wanted.ids[field] || (status.status !== 'applied' && status.status !== 'failed')) continue;
      settled.push({ field, value: wanted.changes[field]!, status: status.status, reason: status.reason });
      delete wanted.changes[field]; delete wanted.ids[field];
    }
    return { wanted: settled.length ? await store(debug, wanted) : wanted, settled };
  });
}

const cacheFile = (rt: ClaudeRuntime): string => path.join(rt.context.dirs.stateDir, CATALOG_CACHE);
export async function cachedCatalog(rt: ClaudeRuntime): Promise<NativeCatalog | null> {
  const value = await readNativeJson(cacheFile(rt));
  return validCatalog(value) ? value : null;
}
/** Keeps the host's catalog: the same CLI version adds efforts of more models, another replaces it. */
export async function saveCatalog(rt: ClaudeRuntime, debug: string): Promise<void> {
  const fresh = await readNativeJson(debug + PARAMETER_CATALOG);
  if (!validCatalog(fresh)) return;
  const old = await cachedCatalog(rt);
  const merged: NativeCatalog = old?.cliVersion === fresh.cliVersion ? { ...fresh, efforts: { ...old.efforts, ...fresh.efforts } } : fresh;
  if (JSON.stringify(merged) !== JSON.stringify(old)) await writeNativeJson(cacheFile(rt), merged);
}
/** A new host starts with the cached catalog: it opens no menu if its CLI version matches. */
export async function seedCatalog(rt: ClaudeRuntime, debug: string): Promise<void> {
  const catalog = await cachedCatalog(rt);
  if (catalog) await writeNativeJson(debug + PARAMETER_CATALOG, catalog);
}
