import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { SpeechError } from './model-store.ts';
export type HelperMessage = Record<string, unknown> & { type: string };
export interface HelperClient {
  request(message: HelperMessage, pcm?: Buffer): Promise<HelperMessage>;
  close(): void;
  closed: Promise<void>;
}
type HelperProcess = Pick<ChildProcessWithoutNullStreams, 'stdin' | 'stdout' | 'on' | 'once' | 'kill'>;
export function createHelperClient(executable: string, options: { launch?: (file: string) => HelperProcess; timeoutMs?: number } = {}): HelperClient {
  const launch = options.launch ?? ((file: string) => spawn(file, [], { stdio: ['pipe', 'pipe', 'ignore'], shell: false }));
  const child = launch(executable);
  let bytes: Buffer = Buffer.alloc(0), ended = false;
  let pending: { resolve: (m: HelperMessage) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;
  const closed = new Promise<void>(resolve => child.once('close', () => resolve()));
  function fail(error: Error) {
    ended = true; bytes = Buffer.alloc(0); clearTimeout(pending?.timer); pending?.reject(error); pending = null;
  }
  function abort(error: Error) {
    if (ended) return;
    fail(error); child.kill('SIGKILL');
  }
  const ioError = () => abort(new SpeechError('helper-io', 'Связь с процессом распознавания прервана. Текст сохранён.'));
  child.on('error', abort);
  child.stdin.on('error', ioError);
  child.stdout.on('error', ioError);
  child.stdout.on('end', () => abort(new SpeechError('helper-exited', 'Процесс распознавания завершился. Текст сохранён.')));
  child.on('exit', () => fail(new SpeechError('helper-exited', 'Процесс распознавания завершился. Текст сохранён.')));
  child.stdout.on('data', (chunk: Buffer) => {
    if (ended) return;
    try {
      bytes = Buffer.concat([bytes, chunk]);
      if (bytes.length > 131080) throw new Error('Helper response exceeds limit');
      if (bytes.length < 4) return;
      const n = bytes.readUInt32LE(0);
      if (n < 2 || n > 131072) throw new Error('Invalid helper JSON length');
      if (bytes.length < n + 8) return;
      if (bytes.readUInt32LE(n + 4) !== 0 || bytes.length !== n + 8 || !pending) throw new Error('Unexpected helper frame');
      const response = JSON.parse(bytes.subarray(4, n + 4).toString('utf8')) as HelperMessage;
      bytes = Buffer.alloc(0);
      if (typeof response.type !== 'string') throw new Error('Invalid helper response');
      const request = pending; pending = null; clearTimeout(request.timer);
      if (response.type === 'error') request.reject(new SpeechError(String(response['code'] ?? 'engine-error'), String(response['message'] ?? 'Ошибка распознавания')));
      else request.resolve(response);
    } catch (error) { abort(error instanceof Error ? error : new Error(String(error))); }
  });
  return {
    closed,
    request(message, pcm = Buffer.alloc(0)) {
      if (ended || pending) return Promise.reject(new SpeechError('helper-state', 'Процесс распознавания недоступен или занят'));
      if (pcm.length > 64000 || pcm.length % 4) return Promise.reject(new SpeechError('invalid-audio', 'Неверный аудиоблок'));
      const json = Buffer.from(JSON.stringify(message));
      if (json.length > 16384) return Promise.reject(new SpeechError('helper-protocol', 'Слишком большая команда'));
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { fail(new SpeechError('helper-timeout', 'Распознавание не отвечает. Текст сохранён.')); child.kill('SIGKILL'); }, options.timeoutMs ?? (message.type === 'load' ? 90000 : 30000));
        pending = { resolve, reject, timer };
        const length = Buffer.alloc(4), size = Buffer.alloc(4);
        length.writeUInt32LE(json.length); size.writeUInt32LE(pcm.length);
        try { child.stdin.write(Buffer.concat([length, json, size, pcm]), error => { if (error) ioError(); }); }
        catch { ioError(); }
      });
    },
    close() {
      if (ended) return;
      fail(new SpeechError('speech-cancelled', 'Диктовка отменена'));
      child.stdin.end();
      const timer = setTimeout(() => child.kill('SIGKILL'), 1000); timer.unref();
      void closed.then(() => clearTimeout(timer));
    },
  };
}
