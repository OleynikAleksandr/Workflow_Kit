// Construct on the click stack: Safari needs AudioContext activation before awaits.
export function createAudioCapture({ onPacket, onError, Context = globalThis.AudioContext, media = navigator.mediaDevices }) {
  const context = new Context();
  const resumed = context.resume(); void resumed.catch(() => {});
  let stream, source, worklet, mute, cancelled = false, stopPromise, flushed;
  const dispose = () => {
    stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
    source?.disconnect(); worklet?.disconnect(); mute?.disconnect();
    if (worklet) { worklet.onprocessorerror = null; worklet.port.onmessage = null; worklet.port.close(); }
    if (context.state !== 'closed') void context.close().catch(() => {});
  };
  return {
    async prepare() {
      try {
        const received = await media.getUserMedia({ audio: { channelCount: 1 } });
        if (cancelled) { received.getTracks().forEach(track => track.stop()); throw new Error('Диктовка отменена'); }
        stream = received;
        await resumed;
        await context.audioWorklet.addModule(new URL('./worklet.js', import.meta.url));
        if (cancelled) throw new Error('Диктовка отменена');
        source = context.createMediaStreamSource(stream);
        worklet = new AudioWorkletNode(context, 'wfk-speech');
        mute = context.createGain(); mute.gain.value = 0;
        worklet.onprocessorerror = () => onError(new Error('Не удалось обработать звук микрофона'));
        worklet.port.onmessage = event => {
          if (cancelled) return;
          if (event.data?.type === 'flushed') flushed?.();
          else if (event.data?.type === 'overload') onError(new Error('Браузер не успевает обрабатывать звук. Текст сохранён.'));
          else if (event.data?.type === 'audio') {
            try { onPacket(event.data.pcm); if (!cancelled) worklet.port.postMessage({ type: 'ack', sequence: event.data.sequence }); }
            catch (e) { onError(e); }
          }
        };
        for (const track of stream.getTracks()) track.onended = () => onError(new Error('Микрофон отключён. Текст сохранён.'));
      } catch (error) { dispose(); throw microphoneError(error); }
    },
    async start() {
      if (cancelled || !source || !worklet) throw new Error('Микрофон не готов');
      source.connect(worklet); worklet.connect(mute); mute.connect(context.destination);
      await context.resume();
    },
    stop() {
      if (stopPromise) return stopPromise;
      stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
      source?.disconnect();
      stopPromise = new Promise((resolve, reject) => {
        if (!worklet || cancelled) { dispose(); resolve(); return; }
        const timer = setTimeout(() => { dispose(); reject(new Error('Не удалось завершить аудиопоток')); }, 2000);
        flushed = () => { clearTimeout(timer); dispose(); resolve(); };
        worklet.port.postMessage('finish');
      });
      return stopPromise;
    },
    cancel() { if (cancelled) return; cancelled = true; flushed?.(); dispose(); },
  };
}

function microphoneError(error) {
  const messages = {
    NotAllowedError: 'Разрешите доступ к микрофону в настройках браузера и macOS, затем повторите диктовку.',
    SecurityError: 'Браузер запретил доступ к микрофону. Проверьте разрешения и откройте локальную панель.',
    NotFoundError: 'Микрофон не найден. Подключите устройство и повторите диктовку.',
    NotReadableError: 'Микрофон недоступен. Проверьте подключение и использование другими приложениями.',
    AbortError: 'Не удалось включить микрофон. Проверьте устройство и повторите диктовку.',
  };
  return messages[error?.name] ? new Error(messages[error.name]) : error;
}
