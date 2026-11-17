import type { IncomingMessage } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { classifyAddress, checkAccess, HttpError } from '#http-server';
import type { HttpServerHandle, Router } from '#http-server';
import { SpeechError } from './model-store.ts';
import type { SpeechLease, SpeechService } from './service.ts';

export function speechUpgradeAllowed(req: IncomingMessage, port: number): boolean {
  return req.url === '/api/speech/stream' && req.method === 'GET' &&
    classifyAddress(req.socket.remoteAddress) === 'loopback' && classifyAddress(req.socket.localAddress) === 'loopback' &&
    checkAccess({ method: 'POST', remoteAddress: req.socket.remoteAddress, localAddress: req.socket.localAddress, host: req.headers.host, origin: req.headers.origin, contentType: 'application/json' }, { port, tailscaleAddresses: [] }).allowed;
}
export function registerSpeechRoutes({ router, server, speech }: { router: Router; server: HttpServerHandle; speech: SpeechService }) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64004, perMessageDeflate: false });
  const detach = server.addUpgrade('/api/speech/stream', (req, socket, head) => {
    if (!speechUpgradeAllowed(req, server.port())) { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return; }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
  });
  wss.on('connection', ws => {
    let lease: SpeechLease | null = null, id: string | undefined, ended = false, last = Date.now(), count = 0;
    const timer = setTimeout(() => fail(new SpeechError('speech-timeout', 'Поток не передаёт аудио')), 90000); timer.unref();
    const fail = (error: unknown) => {
      if (ended) return;
      ended = true; lease?.cancel(); clearTimeout(timer);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'error', dictationId: id, code: error instanceof SpeechError ? error.code : 'speech-error', message: error instanceof Error ? error.message : 'Ошибка распознавания' }));
        ws.close(1008, 'Speech ended');
      }
    };
    ws.on('message', (raw, binary) => {
      if (ended) return;
      try {
        timer.refresh();
        if (Date.now() - last > 1000) { last = Date.now(); count = 0; }
        if (++count > 60) throw new SpeechError('speech-rate', 'Превышена частота аудиоблоков');
        const data = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer);
        if (binary) {
          if (!lease || data.length <= 4) throw new SpeechError('speech-state', 'Поток не готов');
          void lease.feed(Buffer.from(data.subarray(4)), data.readUInt32LE(0)).catch(fail);
          return;
        }
        if (data.length > 4096) throw new SpeechError('speech-protocol', 'Слишком большая команда');
        const message = JSON.parse(data.toString('utf8')) as Record<string, unknown>;
        if (message['type'] === 'begin') {
          if (lease || message['protocolVersion'] !== 1 || typeof message['dictationId'] !== 'string') throw new SpeechError('speech-protocol', 'Неверное начало потока');
          id = message['dictationId'];
          lease = speech.begin(id, event => {
            if (ended || ws.readyState !== WebSocket.OPEN) return;
            if (ws.bufferedAmount > 262144) { fail(new SpeechError('speech-overload', 'Панель не успевает получать текст')); return; }
            ws.send(JSON.stringify(event));
            if (event.type === 'final') { ended = true; clearTimeout(timer); ws.close(1000); }
          });
          void lease.ready.catch(fail);
        } else if (message['dictationId'] !== id || !lease) throw new SpeechError('speech-protocol', 'Неверный владелец потока');
        else if (message['type'] === 'finish') void lease.finish().catch(fail);
        else if (message['type'] === 'cancel') { ended = true; lease.cancel(); ws.close(1000); }
        else throw new SpeechError('speech-protocol', 'Неизвестная команда');
      } catch (error) { fail(error); }
    });
    ws.on('error', fail);
    ws.on('close', () => { clearTimeout(timer); if (!ended) lease?.cancel(); ended = true; });
  });
  const local = (req: IncomingMessage) => {
    if (classifyAddress(req.socket.remoteAddress) !== 'loopback' || classifyAddress(req.socket.localAddress) !== 'loopback') throw new HttpError(403, 'speech-local-only', 'Распознавание доступно только в локальной панели');
  };
  router.get('/api/speech', async ({ req }) => {
    if (classifyAddress(req.socket.remoteAddress) !== 'loopback') return { supported: false, available: false, reason: 'Диктовка доступна только в локальной панели', models: [] };
    return speech.status();
  });
  for (const action of ['download', 'cancel', 'select', 'remove'] as const) router.post(`/api/speech/models/:id/${action}`, async ({ params, req }) => {
    local(req);
    try {
      const id = params['id']!;
      if (action === 'download') { const pending = speech.download(id); void pending.catch(() => {}); }
      else if (action === 'cancel') await speech.cancelDownload(id);
      else if (action === 'select') await speech.select(id);
      else await speech.remove(id);
      return speech.status();
    } catch (error) {
      if (error instanceof SpeechError) throw new HttpError(409, error.code, error.message);
      throw error;
    }
  });
  return async () => {
    detach(); for (const ws of wss.clients) ws.terminate(); wss.close(); await speech.close();
  };
}
