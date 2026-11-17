import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHelperClient } from './helper-client.ts';
import type { HelperClient, HelperMessage } from './helper-client.ts';
import { createModelStore, SpeechError } from './model-store.ts';
import type { ModelStoreOptions } from './model-store.ts';

export interface SpeechOptions extends Omit<ModelStoreOptions, 'inUse'> {
  appDir: string;
  arch?: string;
  helperPath?: string;
  helperFactory?: (file: string) => HelperClient;
}
export interface SpeechLease {
  ready: Promise<void>;
  feed(pcm: Buffer, audioSeq: number): Promise<void>;
  finish(): Promise<void>;
  cancel(): void;
}
export type SpeechService = Awaited<ReturnType<typeof createSpeechService>>;
export async function createSpeechService(options: SpeechOptions) {
  const platform = options.platform ?? process.platform, arch = options.arch ?? process.arch;
  const supported = platform === 'darwin' && arch === 'arm64';
  let phase: 'idle' | 'preparing' | 'listening' | 'finalizing' = 'idle';
  let owner: { id: string; modelId: string; client?: HelperClient; cancel: () => void } | null = null;
  let runtime: HelperClient | null = null, loaded: string | null = null, backend = '';
  let unload: ReturnType<typeof setTimeout> | undefined;
  const closing = new Set<Promise<void>>();
  const store = await createModelStore({ ...options, inUse: id => owner?.modelId === id });
  let executable = options.helperPath ?? path.join(options.appDir, 'speech', 'wfk-speech-helper');
  if (!options.helperPath && supported) {
    try { await access(executable, constants.X_OK); } catch { executable = fileURLToPath(new URL('../../speech-helper/target/debug/wfk-speech-helper', import.meta.url)); }
  }
  let available = supported;
  if (supported) { try { await access(executable, constants.X_OK); } catch { available = false; } }
  const reason = !supported ? 'Диктовка доступна в локальной панели macOS на Apple Silicon' : !available ? 'Нативный компонент распознавания ещё не установлен' : '';
  const requireAvailable = () => { if (!available) throw new SpeechError('speech-unavailable', reason); };
  function dropRuntime() {
    clearTimeout(unload);
    const old = runtime; runtime = null; loaded = null; backend = '';
    if (old) { old.close(); closing.add(old.closed); void old.closed.finally(() => closing.delete(old.closed)); }
  }
  function idle() { if (owner) throw new SpeechError('speech-busy', 'Диктовка уже используется'); }
  function begin(id: string, emit: (message: HelperMessage) => void): SpeechLease {
    requireAvailable(); idle();
    if (!/^[a-zA-Z0-9-]{8,80}$/.test(id)) throw new SpeechError('invalid-dictation', 'Неверный идентификатор диктовки');
    clearTimeout(unload);
    const current = { id, modelId: store.selected(), cancel: () => lease.cancel(), client: undefined as HelperClient | undefined };
    owner = current; phase = 'preparing';
    let cancelled = false, finishing = false, ready = false, queued = 0, nextSeq = 0, total = 0;
    let chain = Promise.resolve();
    const check = () => { if (cancelled || owner !== current) throw new SpeechError('speech-cancelled', 'Диктовка отменена'); };
    function release(drop: boolean) {
      if (owner !== current) return;
      owner = null; phase = 'idle';
      if (drop) dropRuntime();
      else { unload = setTimeout(dropRuntime, 60_000); unload.unref(); }
    }
    function send(message: HelperMessage, audioSeq?: number) {
      check();
      if (message.type === 'transcript' || message.type === 'final') {
        if (typeof message['committed'] !== 'string' || typeof message['tentative'] !== 'string') throw new SpeechError('helper-protocol', 'Неверный результат распознавания');
        if ((message['committed'] + message['tentative']).length > 20000) throw new SpeechError('text-limit', 'Достигнут лимит текста. Уже показанный текст сохранён.');
      }
      emit({ ...message, dictationId: id, ...(audioSeq !== undefined ? { audioSeq } : {}) });
    }
    const preparation = (async () => {
      if (!runtime || loaded !== current.modelId) {
        const file = await store.verify(current.modelId); check(); dropRuntime();
        const client = (options.helperFactory ?? createHelperClient)(executable);
        runtime = client; current.client = client;
        const hello = await client.request({ type: 'hello' }); check();
        if (hello['protocolVersion'] !== 1 || hello['sampleRate'] !== 16000) throw new SpeechError('helper-version', 'Несовместимая версия распознавания');
        const result = await client.request({ type: 'load', path: file }); check();
        if (result.type !== 'loaded') throw new SpeechError('helper-protocol', 'Загрузка модели не подтверждена');
        loaded = current.modelId; backend = String(result['backend'] ?? 'unknown');
      }
      check(); current.client = runtime!;
      const result = await runtime!.request({ type: 'begin' }); check();
      if (result.type !== 'ready') throw new SpeechError('helper-protocol', 'Начало потока не подтверждено');
      ready = true; phase = 'listening'; send({ type: 'ready', protocolVersion: 1 });
    })().catch(error => { release(true); throw error; });
    const lease: SpeechLease = {
      ready: preparation,
      feed(pcm, audioSeq) {
        check();
        if (!ready || finishing || audioSeq !== nextSeq || !pcm.length || pcm.length > 64000 || pcm.length % 4) throw new SpeechError('invalid-audio', 'Неверный порядок или размер аудиоблока');
        for (let i = 0; i < pcm.length; i += 4) if (!Number.isFinite(pcm.readFloatLE(i))) throw new SpeechError('invalid-audio', 'Неверные значения аудио');
        if (queued + pcm.length > 128000) throw new SpeechError('speech-overload', 'Компьютер не успевает распознавать речь. Текст сохранён.');
        total += pcm.length / 4;
        if (total > 16000 * 60 * 120) throw new SpeechError('audio-limit', 'Достигнут предел длительности записи. Текст сохранён.');
        nextSeq++; queued += pcm.length;
        chain = chain.then(async () => { check(); const message = await current.client!.request({ type: 'feed' }, pcm); check(); if (message.type !== 'transcript') throw new SpeechError('helper-protocol', 'Неверный ответ потока'); send(message, audioSeq); }).finally(() => { queued -= pcm.length; });
        return chain;
      },
      finish() {
        check();
        if (finishing) return chain;
        if (!ready) throw new SpeechError('speech-state', 'Поток ещё не готов');
        finishing = true; phase = 'finalizing';
        chain = chain.then(async () => { check(); const message = await current.client!.request({ type: 'finish' }); check(); if (message.type !== 'final') throw new SpeechError('helper-protocol', 'Завершение не подтверждено'); send(message); release(false); });
        return chain;
      },
      cancel() { if (cancelled) return; cancelled = true; release(true); },
    };
    return lease;
  }
  return {
    begin,
    async status() { return { supported, available, reason, phase, backend, selected: store.selected(), models: await store.list() }; },
    download(id: string) { requireAvailable(); return store.download(id); },
    cancelDownload: store.cancel,
    async select(id: string) { requireAvailable(); idle(); await store.select(id); dropRuntime(); },
    async remove(id: string) { requireAvailable(); idle(); if (loaded === id) dropRuntime(); await store.remove(id); },
    async close() { owner?.cancel(); dropRuntime(); await store.close(); await Promise.all([...closing]); },
  };
}
