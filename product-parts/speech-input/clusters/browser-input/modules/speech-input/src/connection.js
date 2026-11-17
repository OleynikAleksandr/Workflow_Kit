export function createSpeechConnection({ id, onMessage, onError, WebSocketImpl = WebSocket, baseUrl = location.href }) {
  const url = new URL('/api/speech/stream', baseUrl); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocketImpl(url);
  let ended = false, isReady = false, finishing = false, sequence = 0, eventSeq = 0, outstanding = 0;
  const pending = new Map();
  let readyResolve, readyReject, finalResolve, finalReject;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; }); void ready.catch(() => {});
  const final = new Promise((resolve, reject) => { finalResolve = resolve; finalReject = reject; }); void final.catch(() => {});
  let timer = setTimeout(() => fail(new Error('Распознавание не отвечает')), 90000);
  function fail(error) {
    if (ended) return; ended = true; clearTimeout(timer);
    readyReject(error); finalReject(error); onError(error); ws.close();
  }
  ws.onopen = () => { if (ended) { ws.close(); return; } ws.send(JSON.stringify({ type: 'begin', dictationId: id, protocolVersion: 1 })); };
  ws.onerror = () => fail(new Error('Не удалось подключиться к распознаванию речи'));
  ws.onclose = () => { if (!ended) fail(new Error('Связь с распознаванием прервана. Текст сохранён.')); };
  ws.onmessage = event => {
    if (ended) return;
    try {
      const message = JSON.parse(event.data);
      if (message.dictationId !== id) return;
      if (message.type === 'error') { fail(new Error(message.message || 'Ошибка распознавания')); return; }
      if (message.type === 'ready') { isReady = true; clearTimeout(timer); readyResolve(); return; }
      if (!['transcript', 'final'].includes(message.type) || !isReady || !Number.isSafeInteger(message.eventSeq) || message.eventSeq <= eventSeq) return;
      eventSeq = message.eventSeq;
      if (message.type === 'transcript') {
        if (!pending.has(message.audioSeq)) throw new Error('Неверный порядок аудиопотока');
        outstanding -= pending.get(message.audioSeq); pending.delete(message.audioSeq);
      }
      if (typeof message.committed !== 'string' || typeof message.tentative !== 'string') throw new Error('Неверный результат распознавания');
      onMessage(message);
      if (message.type === 'final') { ended = true; clearTimeout(timer); finalResolve(message); ws.close(); }
    } catch (error) { fail(error); }
  };
  return {
    ready,
    sendAudio(pcm) {
      if (ended || !isReady || finishing || !pcm.length || pcm.length > 16000) throw new Error('Аудиопоток не готов');
      if (outstanding + pcm.byteLength > 128000 || ws.bufferedAmount + pcm.byteLength > 128000) throw new Error('Компьютер не успевает распознавать речь. Текст сохранён.');
      const frame = new ArrayBuffer(4 + pcm.byteLength), view = new DataView(frame);
      view.setUint32(0, sequence, true);
      for (let i = 0; i < pcm.length; i++) { if (!Number.isFinite(pcm[i])) throw new Error('Неверный аудиосигнал'); view.setFloat32(4 + i * 4, pcm[i], true); }
      pending.set(sequence++, pcm.byteLength); outstanding += pcm.byteLength;
      ws.send(frame);
    },
    finish() {
      if (!finishing && !ended) { finishing = true; clearTimeout(timer); timer = setTimeout(() => fail(new Error('Завершение распознавания не отвечает. Текст сохранён.')), 30000); ws.send(JSON.stringify({ type: 'finish', dictationId: id })); }
      return final;
    },
    cancel() { if (ended) return; ended = true; clearTimeout(timer); const error = new Error('Диктовка отменена'); readyReject(error); finalReject(error); if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'cancel', dictationId: id })); ws.close(); },
  };
}
