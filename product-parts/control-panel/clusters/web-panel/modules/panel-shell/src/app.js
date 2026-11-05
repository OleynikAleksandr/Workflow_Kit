// @ts-check
// Panel bootstrap: polls GET /api/state every 3 s and renders the header and the registered cards.
import { listCards } from './cards.js';
import { h } from './dom.js';
import './system-card.js';

/** Polling interval in milliseconds (D3). */
const POLL_MS = 3000;
/** A request slower than this counts as failed. */
const TIMEOUT_MS = 8000;

/** @type {Map<string, string>} Last rendered selection per card, to skip unchanged cards. */
const rendered = new Map();
/** @type {ReturnType<typeof setTimeout> | undefined} */
let timer;

/**
 * @param {string} id
 * @returns {HTMLElement}
 */
function byId(id) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node;
}

/**
 * Shows the connection state in the header.
 * @param {'ok' | 'error' | 'pending'} state
 * @param {string} text
 */
function setLink(state, text) {
  const link = byId('link-status');
  link.dataset['state'] = state;
  const label = link.querySelector('.link-text');
  if (label) label.textContent = text;
}

/**
 * Updates the header badges from the "system" section.
 * @param {Record<string, unknown>} state
 */
function renderHeader(state) {
  const system = /** @type {{ version?: string, os?: { label?: string } } | undefined} */ (state['system']);
  byId('meta-version').textContent = system?.version ? `v${system.version}` : '—';
  byId('meta-os').textContent = system?.os?.label ?? '—';
}

/**
 * Renders every registered card, re-rendering only those whose data changed.
 * @param {Record<string, unknown>} state
 */
function renderCards(state) {
  const container = byId('cards');
  for (const card of listCards()) {
    const domId = `card-${card.id}`;
    let section = document.getElementById(domId);
    if (!section) {
      section = h('section', { class: 'card', id: domId, 'aria-labelledby': `${domId}-title` }, [
        h('h2', { id: `${domId}-title` }, [card.title]),
        h('div', { class: 'card-body' }),
      ]);
      container.append(section);
    }
    const data = card.select(state);
    const key = JSON.stringify(data) ?? 'undefined';
    if (rendered.get(card.id) === key) continue;
    rendered.set(card.id, key);
    const body = section.querySelector('.card-body');
    if (!body) continue;
    try {
      body.replaceChildren(card.render(data, state));
    } catch (error) {
      body.replaceChildren(h('p', { class: 'error' }, [`Ошибка карточки: ${String(error)}`]));
    }
  }
}

/** Fetches the state once and renders it. */
async function refresh() {
  const controller = new AbortController();
  const abort = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch('/api/state', { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const state = /** @type {Record<string, unknown>} */ (await response.json());
    renderHeader(state);
    renderCards(state);
    setLink('ok', `обновлено ${new Date().toLocaleTimeString('ru-RU')}`);
  } catch (error) {
    setLink('error', `нет связи с бэкендом (${error instanceof Error ? error.message : String(error)})`);
  } finally {
    clearTimeout(abort);
  }
}

/** True while a poll is running; a second loop() call meanwhile is ignored. */
let inFlight = false;

/** Polls forever; the next poll starts after the previous one finishes. */
async function loop() {
  if (inFlight) return;
  clearTimeout(timer);
  inFlight = true;
  try {
    await refresh();
  } finally {
    inFlight = false;
  }
  timer = setTimeout(loop, POLL_MS);
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void loop();
});

void loop();
