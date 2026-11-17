import { api } from './api.js';
import { h } from './dom.js';

/** Persistent keyed controls: a progress poll never replaces the focused button. */
export function createSpeechSettings() {
  const message = h('p', { class: 'notice', role: 'status', 'aria-live': 'polite' }); message.hidden = true;
  const summary = h('p', { class: 'muted' }, ['Проверка доступности…']);
  const list = h('div', { class: 'speech-model-list' });
  const element = h('section', { class: 'panel', 'aria-label': 'Распознавание речи' }, [h('h2', {}, ['Распознавание речи']), summary, list, message]);
  const rows = new Map();
  let state, acting = false, fetching = false, revision = 0, disposed = false;
  async function act(id, action) {
    if (acting) return;
    acting = true; revision++; message.hidden = true; draw();
    try {
      state = await api('POST', `/api/speech/models/${encodeURIComponent(id)}/${action}`, {});
    } catch (error) { message.textContent = error instanceof Error ? error.message : String(error); message.hidden = false; }
    finally { acting = false; draw(); }
  }
  function build(id) {
    const title = h('strong'), description = h('p', { class: 'muted' });
    const status = h('span', { role: 'status' });
    const progress = h('progress', { class: 'speech-progress', 'aria-label': 'Загрузка модели' });
    const license = h('a', { target: '_blank', rel: 'noreferrer noopener' }), source = h('a', { target: '_blank', rel: 'noreferrer noopener' }, ['Источник']);
    const buttons = Object.fromEntries([['download', 'Скачать'], ['cancel', 'Отменить загрузку'], ['select', 'Выбрать'], ['remove', 'Удалить']].map(([action, text]) => {
      const button = h('button', { type: 'button', class: 'btn' }, [text]);
      button.addEventListener('click', () => void act(id, action)); return [action, button];
    }));
    const node = h('div', { class: 'speech-model', 'data-model': id }, [title, description, status, progress, h('div', { class: 'speech-model-actions' }, Object.values(buttons)), h('p', { class: 'speech-model-links' }, [license, ' · ', source])]);
    return { node, title, description, status, progress, license, source, buttons };
  }
  function draw() {
    if (!state || disposed) return;
    const available = state.available === true;
    summary.textContent = available ? 'Диктуйте в поле сообщения и отправляйте текст отдельно. Распознавание работает на этом Mac.' : state.reason || 'Диктовка недоступна';
    list.hidden = !available;
    const seen = new Set();
    for (const [index, item] of (state.models ?? []).entries()) {
      const model = item.model, id = model.id; seen.add(id);
      let row = rows.get(id); if (!row) { row = build(id); rows.set(id, row); }
      if (list.children[index] !== row.node) list.insertBefore(row.node, list.children[index] ?? null);
      const selected = state.selected === id, busy = state.phase && state.phase !== 'idle';
      row.title.textContent = `${model.name} · ${model.quantization}`;
      row.description.textContent = `${(model.sizeBytes / 1e9).toFixed(2)} ГБ · ${model.languages.includes('ru') ? 'Русский' : model.languages.join(', ')} · ${model.streaming ? 'Потоковое распознавание' : 'Без потока'}`;
      const labels = { missing: 'Не установлена', downloading: 'Скачивается…', installed: selected && state.phase === 'preparing' ? 'Загружается…' : selected && state.backend ? 'Готова' : 'Установлена', error: item.error || 'Ошибка загрузки' };
      const nextStatus = labels[item.state] || '';
      if (row.status.textContent !== nextStatus) row.status.textContent = nextStatus;
      row.progress.hidden = item.state !== 'downloading'; row.progress.max = model.sizeBytes; row.progress.value = item.receivedBytes;
      row.progress.setAttribute('aria-label', `Загрузка ${model.name} ${model.quantization}`);
      row.license.textContent = model.license; row.license.href = model.licenseUrl; row.source.href = model.source;
      row.buttons.download.hidden = !['missing', 'error'].includes(item.state);
      row.buttons.cancel.hidden = item.state !== 'downloading';
      row.buttons.select.hidden = item.state !== 'installed'; row.buttons.select.textContent = selected ? 'Выбрана' : 'Выбрать';
      row.buttons.remove.hidden = !['installed', 'error'].includes(item.state);
      for (const [action, button] of Object.entries(row.buttons)) {
        button.disabled = acting || !available || (action === 'select' && (selected || busy)) || (action === 'remove' && busy) || (action === 'download' && busy && selected);
        button.setAttribute('aria-busy', String(acting));
      }
    }
    for (const [id, row] of rows) if (!seen.has(id)) { row.node.remove(); rows.delete(id); }
  }
  async function refresh() {
    if (disposed || fetching || acting || !element.isConnected || !element.getClientRects().length || document.visibilityState === 'hidden') return;
    const token = revision; fetching = true;
    try { const next = await api('GET', '/api/speech'); if (token === revision && !disposed) { state = next; draw(); } }
    catch (error) { summary.textContent = error instanceof Error ? error.message : 'Служба распознавания недоступна'; }
    finally { fetching = false; }
  }
  const timer = setInterval(() => void refresh(), 1500);
  return { element, refresh, dispose() { disposed = true; clearInterval(timer); } };
}
