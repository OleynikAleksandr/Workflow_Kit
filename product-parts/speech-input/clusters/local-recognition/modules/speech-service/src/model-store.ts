import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, open, rm, statfs } from 'node:fs/promises';
import path from 'node:path';
import { readJsonFile, renameRetrying, writeJsonAtomic } from '#data-store';
import { DEFAULT_MODEL_ID, SPEECH_MODELS } from './catalog.ts';
import type { SpeechModel } from './catalog.ts';

export class SpeechError extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}
export interface ModelState {
  model: SpeechModel;
  state: 'missing' | 'downloading' | 'installed' | 'error';
  receivedBytes: number;
  error?: string;
}
interface Job { controller: AbortController; done: Promise<void>; received: number; cancelled: boolean }
export interface ModelStoreOptions {
  root: string;
  settingsFile: string;
  platform?: NodeJS.Platform;
  catalog?: readonly SpeechModel[];
  fetch?: typeof fetch;
  inUse?: (id: string) => boolean;
}
export type ModelStore = Awaited<ReturnType<typeof createModelStore>>;

export async function createModelStore(options: ModelStoreOptions) {
  const platform = options.platform ?? process.platform;
  const catalog = options.catalog ?? SPEECH_MODELS;
  const fetchModel = options.fetch ?? fetch;
  await mkdir(options.root, { recursive: true, mode: 0o700 });
  if ((await lstat(options.root)).isSymbolicLink()) throw new SpeechError('unsafe-model-path', 'Каталог моделей не должен быть симлинком');
  const settings = await readJsonFile(options.settingsFile) as { selected?: string } | undefined;
  let selected = catalog.some(m => m.id === settings?.selected) ? settings!.selected! : catalog.find(m => m.id === DEFAULT_MODEL_ID)?.id ?? catalog[0]!.id;
  const jobs = new Map<string, Job>();
  const errors = new Map<string, string>();
  function model(id: string) {
    const m = catalog.find(m => m.id === id);
    if (!m || !/^[a-z0-9-]+$/.test(m.id)) throw new SpeechError('unknown-model', 'Неизвестная модель');
    return m;
  }
  const file = (id: string) => path.join(options.root, `${model(id).id}.gguf`);
  async function safeInfo(id: string) {
    const info = await lstat(file(id)).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
    if (info && (!info.isFile() || info.isSymbolicLink())) throw new SpeechError('unsafe-model-path', 'Файл модели не принадлежит хранилищу Kit');
    return info;
  }
  function idle(id: string) {
    model(id);
    if (options.inUse?.(id)) throw new SpeechError('speech-busy', 'Модель используется диктовкой');
  }
  async function verify(id: string): Promise<string> {
    const m = model(id), info = await safeInfo(id);
    if (!info) throw new SpeechError('model-missing', 'Скачайте модель в настройках распознавания речи');
    const hash = createHash('sha256');
    if (info.size === m.sizeBytes) for await (const chunk of createReadStream(file(id))) hash.update(chunk);
    if (info.size !== m.sizeBytes || hash.digest('hex') !== m.sha256) {
      errors.set(id, 'Размер или SHA-256 модели не совпадает');
      throw new SpeechError('model-checksum', errors.get(id)!);
    }
    errors.delete(id);
    return file(id);
  }
  async function list(): Promise<ModelState[]> {
    return Promise.all(catalog.map(async m => {
      const job = jobs.get(m.id);
      let info = null;
      try { info = await safeInfo(m.id); } catch (e) { errors.set(m.id, String(e)); }
      const error = errors.get(m.id);
      return { model: m, state: job ? 'downloading' : error ? 'error' : info?.size === m.sizeBytes ? 'installed' : 'missing', receivedBytes: job?.received ?? (info?.size === m.sizeBytes ? m.sizeBytes : 0), ...(error ? { error } : {}) };
    }));
  }
  async function perform(id: string, job: Job) {
    const m = model(id), partial = file(id) + '.partial';
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await safeInfo(id);
      const disk = await statfs(options.root);
      if (disk.bavail * disk.bsize < m.sizeBytes + 16 * 1024 * 1024) throw new SpeechError('disk-full', 'Недостаточно места для модели');
      await rm(partial, { force: true });
      const resetTimeout = () => { clearTimeout(timeout); timeout = setTimeout(() => job.controller.abort(new Error('Загрузка не отвечает')), 45_000); };
      resetTimeout();
      const url = `https://huggingface.co/${m.repository}/resolve/${m.revision}/${encodeURIComponent(m.filename)}`;
      const response = await fetchModel(url, { signal: job.controller.signal });
      if (!response.ok || !response.body) throw new SpeechError('download-failed', `Не удалось скачать модель: HTTP ${response.status}`);
      const hash = createHash('sha256');
      const output = await open(partial, 'wx', 0o600);
      const reader = response.body.getReader();
      try {
        for (;;) {
          const { done, value: chunk } = await reader.read();
          if (done) break;
          job.controller.signal.throwIfAborted();
          resetTimeout();
          job.received += chunk.byteLength;
          if (job.received > m.sizeBytes) throw new SpeechError('model-size', 'Размер загрузки превышает каталог');
          hash.update(chunk);
          // FileHandle.write may write less than requested.
          let offset = 0;
          while (offset < chunk.byteLength) {
            const written = (await output.write(chunk, offset)).bytesWritten;
            if (!written) throw new SpeechError('download-write', 'Не удалось записать модель');
            offset += written;
          }
        }
        await output.sync();
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); await output.close(); }
      job.controller.signal.throwIfAborted();
      if (job.received !== m.sizeBytes || hash.digest('hex') !== m.sha256) throw new SpeechError('model-checksum', 'Размер или SHA-256 загрузки не совпадает');
      await renameRetrying(partial, file(id), platform);
      errors.delete(id);
    } catch (e) {
      job.controller.abort();
      if (!job.cancelled) { errors.set(id, e instanceof Error ? e.message : String(e)); throw e; }
    } finally {
      clearTimeout(timeout);
      await rm(partial, { force: true, maxRetries: 3, retryDelay: 100 });
      jobs.delete(id);
    }
  }
  function download(id: string): Promise<void> {
    idle(id);
    const existing = jobs.get(id);
    if (existing) return existing.done;
    errors.delete(id);
    const job: Job = { controller: new AbortController(), done: Promise.resolve(), received: 0, cancelled: false };
    jobs.set(id, job);
    job.done = perform(id, job);
    return job.done;
  }
  async function cancel(id: string) {
    model(id);
    const job = jobs.get(id);
    if (!job) return;
    job.cancelled = true; job.controller.abort();
    await job.done;
  }
  return {
    model, list, verify, download, cancel,
    selected: () => selected,
    downloading: () => jobs.size > 0,
    async select(id: string) {
      idle(id); await verify(id);
      await writeJsonAtomic(options.settingsFile, { version: 1, selected: id }, { platform });
      selected = id;
    },
    async remove(id: string) {
      idle(id);
      if (jobs.has(id)) throw new SpeechError('download-active', 'Сначала отмените загрузку');
      await safeInfo(id); await rm(file(id), { force: true, maxRetries: 3, retryDelay: 100 }); errors.delete(id);
    },
    async close() { await Promise.all([...jobs.keys()].map(cancel)); },
  };
}
