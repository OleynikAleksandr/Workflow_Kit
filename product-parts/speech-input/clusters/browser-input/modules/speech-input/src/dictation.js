// Browser public entry. Field state belongs to its caller; this module never sends a message.
import { beginRange, applySnapshot, browserCapability } from './field-model.js';
import { createAudioCapture } from './capture.js';
import { createSpeechConnection } from './connection.js';
export function attachDictation({ input, button, onText, onState = () => {}, onError = () => {}, canStart = () => true, limit = 20000, captureFactory = createAudioCapture, connectionFactory = createSpeechConnection }) {
  let state = 'idle', available = false, reason = 'Проверка распознавания…', generation = 0, current = null, disposed = false, visible = true;
  const active = () => ['preparing', 'listening', 'finalizing'].includes(state);
  const labels = { preparing: 'Подготовка…', listening: 'Слушаю — нажмите, чтобы остановить', finalizing: 'Завершаю распознавание…', idle: 'Начать диктовку', error: 'Повторить диктовку' };
  function sync() {
    button.disabled = disposed || !available || state === 'finalizing' || (!active() && !canStart());
    button.title = available ? labels[state] : reason;
    button.setAttribute('aria-label', button.title);
    button.setAttribute('aria-pressed', String(active()));
    button.setAttribute('aria-busy', String(state === 'preparing' || state === 'finalizing'));
  }
  function change(next) { state = next; sync(); onState(next, active() ? labels[next] : ''); }
  const observer = new MutationObserver(() => { if (active() && !input.isConnected) cancel(); });
  function cancel() {
    generation++; const old = current; current = null; observer.disconnect();
    old?.capture.cancel(); old?.connection?.cancel();
    if (active()) change('idle');
  }
  function fail(error, token) {
    if (token !== generation || disposed) return;
    cancel(); change('error'); onError(error instanceof Error ? error.message : String(error));
  }
  async function readStatus() {
    const response = await fetch('/api/speech');
    if (!response.ok) throw new Error('Служба распознавания недоступна');
    return response.json();
  }
  const client = browserCapability({ platform: navigator.platform, userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints, secure: window.isSecureContext, hostname: location.hostname, audioWorklet: typeof AudioWorkletNode === 'function', media: !!navigator.mediaDevices?.getUserMedia });
  async function refresh() {
    if (disposed) return;
    try { const status = await readStatus(); if (disposed) return; available = client && status.available; reason = client ? status.reason : 'Диктовка доступна в локальном браузере macOS'; }
    catch { available = false; reason = 'Служба распознавания недоступна'; }
    sync();
  }
  async function start() {
    if (active() || disposed || !visible || !available || !canStart()) return;
    const token = ++generation, range = beginRange(input.value, input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length);
    change('preparing'); observer.observe(document.documentElement, { childList: true, subtree: true });
    try {
      const capture = captureFactory({ onPacket: pcm => { if (token === generation) current?.connection?.sendAudio(pcm); }, onError: e => fail(e, token) });
      current = { capture, connection: null, range };
      const status = await readStatus();
      if (token !== generation) return;
      if (!status.available) throw new Error(status.reason || 'Распознавание недоступно');
      if (!status.models?.some(row => row.model.id === status.selected && row.state === 'installed')) throw new Error('Скачайте и выберите модель в настройках распознавания речи');
      const id = crypto.randomUUID();
      const connection = connectionFactory({ id, onError: e => fail(e, token), onMessage: message => {
        if (token !== generation || !current || !input.isConnected || !visible) return;
        const update = applySnapshot(range, message.committed, message.tentative, limit);
        onText(update.text);
        if (document.activeElement === input) input.setSelectionRange(update.caret, update.caret);
        if (update.clipped) fail(new Error('Достигнут лимит текста. Черновик сохранён.'), token);
      } });
      current.connection = connection;
      await Promise.all([capture.prepare(), connection.ready]);
      if (token !== generation) return;
      await capture.start();
      if (token !== generation) { capture.cancel(); return; }
      change('listening');
    } catch (error) { fail(error, token); }
  }
  async function stop() {
    if (state === 'preparing') { cancel(); return; }
    if (state !== 'listening' || !current) return;
    const token = generation, owned = current;
    change('finalizing');
    try {
      await owned.capture.stop(); if (token !== generation) return;
      const final = await owned.connection.finish(); if (token !== generation) return;
      generation++; current = null; observer.disconnect(); change('idle');
      if (final.truncated) onError('Достигнут предел модели. Распознанный текст сохранён.');
    } catch (error) { fail(error, token); }
  }
  const toggle = () => { if (active()) void stop(); else void start(); };
  const edit = () => { if (active()) cancel(); };
  const navigate = event => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key) || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a')) edit(); };
  for (const name of ['beforeinput', 'input', 'compositionstart', 'pointerdown']) input.addEventListener(name, edit);
  input.addEventListener('keydown', navigate); button.addEventListener('click', toggle); window.addEventListener('pagehide', cancel);
  sync(); void refresh();
  return {
    get blockingSend() { return active(); },
    get state() { return state; },
    start, stop, cancel, refresh, sync,
    setVisible(next) { visible = next; if (!visible) cancel(); },
    dispose() { if (disposed) return; cancel(); disposed = true; observer.disconnect(); for (const name of ['beforeinput', 'input', 'compositionstart', 'pointerdown']) input.removeEventListener(name, edit); input.removeEventListener('keydown', navigate); button.removeEventListener('click', toggle); window.removeEventListener('pagehide', cancel); sync(); },
  };
}
