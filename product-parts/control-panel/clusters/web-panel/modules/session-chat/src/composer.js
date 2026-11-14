// @ts-check
import { canSend, errorText, sendOutcome, sendUrl } from './chat-model.js';
import { createParameters } from './parameters.js';
import { DELIVERY_CONFIRM_MS, NOT_DELIVERED_TEXT, composerData, createInputKeys, effectiveTurn, interruptUrl, isStaleTurn, mayClearDraft, undelivered } from './composer-model.js';

/** Compact composer. Its DOM, draft and request lock belong to one project/session.
 * @param {{ shell: import('./session-chat.js').Shell, projectId: string, key: string, provider: string,
 * onSent: () => void }} options
 */
export function createComposer({ shell, projectId, key, provider, onSent }) {
  const { h } = shell.dom;
  const keys = createInputKeys();
  let data = composerData({}, projectId, key, provider);
  let stateRevision = 0;
  let draftRevision = 0;
  /** @type {'send' | 'stop' | null} */
  let busy = null;
  /** @type {string | null} */
  let confirmedRef = null;
  let requestRefresh = () => {};
  const icon = (/** @type {string} */ name) => h('span', { class: `sc-icon sc-icon-${name}`, 'aria-hidden': 'true' });
  /** @param {string} name @param {string} title */
  function iconButton(name, title) {
    return /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'sc-icon-button', 'aria-label': title, title }, [icon(name)]));
  }
  const plus = iconButton('plus', 'Вложения — позже');
  const microphone = iconButton('mic', 'Микрофон — позже');
  plus.disabled = microphone.disabled = true;
  const action = iconButton('enter', 'Отправить сообщение');
  const input = /** @type {HTMLTextAreaElement} */ (h('textarea', {
    class: 'sc-input', rows: '1', 'aria-label': 'Сообщение агенту',
    placeholder: 'Сообщение агенту…', autocapitalize: 'sentences',
  }));
  const queue = /** @type {HTMLButtonElement} */ (h('button', {
    type: 'button', class: 'sc-queue', title: 'Отправить в очередь (Ctrl+Enter или ⌘+Enter)',
  }, ['В очередь']));
  const model = h('span', { class: 'sc-model' });
  const parameters = h('div', { class: 'sc-parameters', 'aria-label': 'Параметры сессии' }, [
    model,
    h('span', { title: 'Усилие: нет данных', 'aria-label': 'Усилие: нет данных' }, ['—']),
    h('span', { title: 'Режим: нет данных', 'aria-label': 'Режим: нет данных' }, ['—']),
    h('span', { class: 'sc-context', role: 'img', title: 'Контекст: нет данных', 'aria-label': 'Контекст: нет данных' }, [icon('circle')]),
  ]);
  const availability = h('p', { class: 'sc-availability sc-note' });
  const status = h('p', { class: 'sc-status', role: 'status', 'aria-live': 'polite' });
  status.hidden = true;
  const editor = h('div', {class:'sc-editor'}, [plus, input, action, microphone]);
  const details = h('div', {class:'sc-details'}, [queue]);
  const parameterView = createParameters({ shell, projectId, key, provider, fallback: parameters, report, onLayout(native) {
    details.classList.toggle('sc-native-details', native);
    if (native) { if (plus.parentElement !== details) { details.prepend(plus, parameterView.accessNode); details.append(microphone); } }
    else if (plus.parentElement !== editor) { editor.prepend(plus); editor.append(microphone); parameterView.accessNode.remove(); }
  }});
  details.append(parameterView.node);
  const node = h('div', { class: 'sc-compose' }, [
    editor, details, availability, status,
  ]);

  function turn() { return effectiveTurn(data.turn, confirmedRef); }
  function refresh() {
    const current = turn();
    const working = current.state === 'working';
    const pending = busy !== null || current.pending;
    const stopping = busy === 'stop' || current.pending;
    const title = working ? (stopping ? 'Останавливаю…' : !current.available ? current.reason : 'Остановить ответ') : 'Отправить сообщение';
    action.setAttribute('aria-label', title);
    action.title = title;
    action.classList.toggle('sc-stop', working);
    action.firstElementChild?.setAttribute('class', `sc-icon sc-icon-${working ? 'stop' : 'enter'}`);
    action.disabled = working ? pending || !current.available || !current.turnRef : !canSend(input.value, pending);
    action.setAttribute('aria-busy', String(stopping));
    availability.textContent = current.pending && busy !== 'stop' ? 'Останавливаю…' : working && !current.available ? current.reason : '';
    availability.hidden = !availability.textContent;
    input.title = working ? 'Enter — новая строка; Ctrl+Enter или ⌘+Enter — в очередь' : 'Enter — отправить; Shift+Enter — новая строка';
    queue.hidden = !working || !input.value.trim();
    queue.disabled = !canSend(input.value, pending);
    model.textContent = data.model;
    model.title = data.model === '—' ? 'Модель: нет данных' : `Модель: ${data.model}`;
    model.setAttribute('aria-label', model.title);
  }
  /** @param {string} text @param {'muted' | 'ok' | 'error'} tone */
  function report(text, tone) {
    status.textContent = text;
    status.dataset['tone'] = tone;
    status.hidden = !text;
  }
  function fit() {
    const dialog = node.closest('.sc-card');
    const limit = Math.max(44, Math.min(120, (dialog?.clientHeight || window.innerHeight) * 0.25));
    input.style.height = '0px';
    input.style.height = `${Math.min(limit, Math.max(44, input.scrollHeight))}px`;
  }
  async function send() {
    if (!canSend(input.value, busy !== null || turn().pending)) return;
    const text = input.value;
    const revision = draftRevision;
    busy = 'send';
    refresh();
    report('Отправляю…', 'muted');
    try {
      const response = await shell.api('POST', sendUrl(projectId, key), { text });
      if (mayClearDraft(revision, draftRevision, text, input.value)) input.value = '';
      report(sendOutcome(response), 'ok');
      if (response && typeof response === 'object' && 'queued' in response && data.turn.state === 'waiting') watchDelivery(text);
      onSent();
      void parameterView.refresh();
      requestRefresh();
    } catch (error) {
      report(errorText(error), 'error');
    } finally {
      busy = null;
      fit();
      refresh();
    }
  }
  /** @type {ReturnType<typeof setTimeout> | null} */
  let deliveryTimer = null;
  /** A queued message for a waiting agent must start its turn (M28 3.3); otherwise the text comes back.
   * @param {string} text */
  function watchDelivery(text) {
    if (deliveryTimer) clearTimeout(deliveryTimer);
    deliveryTimer = setTimeout(() => {
      deliveryTimer = null;
      if (!node.isConnected || !undelivered(data)) return;
      if (input.value.trim() === '') { input.value = text; fit(); }
      report(NOT_DELIVERED_TEXT, 'error');
    }, DELIVERY_CONFIRM_MS);
  }
  /** @param {import('./composer-model.js').ComposerData} next */
  function update(next) {
    if (JSON.stringify(data) !== JSON.stringify(next)) stateRevision += 1;
    data = next;
    if (confirmedRef && next.turn.turnRef !== confirmedRef) confirmedRef = null;
    refresh();
  }
  async function stop() {
    const current = turn();
    if (busy || current.pending || current.state !== 'working' || !current.available || !current.turnRef) return;
    const target = current.turnRef;
    busy = 'stop';
    refresh();
    report('Останавливаю…', 'muted');
    try {
      const result = await shell.api('POST', interruptUrl(projectId, key), { turnRef: target });
      if (result?.stopped !== true || !['interrupted', 'already-idle'].includes(result.status)) {
        throw new Error('Остановка не подтверждена');
      }
      // A late response cannot stop a newer generation in the UI.
      confirmedRef = target;
      report(result.status === 'already-idle' ? 'Ответ уже завершён' : 'Ответ остановлен', 'ok');
    } catch (error) {
      if (isStaleTurn(error)) {
        report('Ход сменился. Обновляю состояние…', 'muted');
        const revision = stateRevision;
        try {
          // shell.api retains error codes but not error.current. Recover through the public state;
          // an intervening shell poll wins over this read. Never retry an interrupt implicitly.
          const state = await shell.api('GET', '/api/state');
          if (stateRevision === revision) update(composerData(state, projectId, key, provider));
          report('Ход сменился. Для остановки текущего ответа нажмите Stop ещё раз', 'muted');
        } catch (readError) { report(errorText(readError), 'error'); }
      } else report(errorText(error), 'error');
    } finally {
      busy = null;
      refresh();
      requestRefresh();
    }
  }
  input.addEventListener('input', () => { draftRevision += 1; fit(); refresh(); });
  input.addEventListener('compositionstart', () => keys.start());
  input.addEventListener('compositionend', (event) => keys.end(event.timeStamp));
  input.addEventListener('keyup', (event) => keys.up(event.key));
  input.addEventListener('keydown', (event) => {
    const intent = keys.down(event, turn().state === 'working');
    if (intent !== 'native') event.preventDefault();
    if (intent === 'send') void send();
  });
  action.addEventListener('click', () => { if (turn().state === 'working') void stop(); else void send(); });
  queue.addEventListener('click', () => void send());
  // Observe only the owning card while mounted; no per-session global resize handlers.
  const observer = new ResizeObserver(fit);
  let observed = false;
  refresh();
  return {
    node,
    /** @param {boolean} visible */
    setVisible(visible) {
      parameterView.setVisible(visible);
      if (!visible && observed) { observer.disconnect(); observed = false; }
      const card = node.closest('.sc-card');
      if (visible && card && !observed) { observer.observe(card); observed = true; fit(); }
    },
    /** @param {import('./composer-model.js').ComposerData} next @param {() => void} refreshState */
    update(next, refreshState) {
      requestRefresh = refreshState;
      update(next);
      requestAnimationFrame(() => {
        const card = node.closest('.sc-card');
        if (card && !observed) { observer.observe(card); observed = true; }
        fit();
      });
    },
  };
}
