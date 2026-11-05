// @ts-check
// Panel bootstrap: polls GET /api/state every 3 s and renders the header and the registered cards.
import { api, ApiError } from './api.js';
import { expandCards, registerCard, registerCardGroup, requestRefresh, setRefreshHandler } from './cards.js';
import { code, facts, h, notice, pill, plainInput } from './dom.js';
import './system-card.js';
import './projects-card.js';
import './structure-card.js';

/**
 * Panel extensions mounted by the backend under their own prefix; each exports install(shell).
 * They get the shell helpers injected instead of importing panel files by URL.
 */
export const PANEL_EXTENSIONS = ['/provider-cards/provider-cards.js'];

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
 * Renders every card (plain cards and card group items), re-rendering only those whose data
 * changed; keeps the sections in card order and removes the cards that disappeared.
 * @param {Record<string, unknown>} state
 */
function renderCards(state) {
  const container = byId('cards');
  /** @type {HTMLElement[]} */
  const sections = [];
  for (const card of expandCards(state)) {
    const domId = `card-${card.id}`;
    let section = document.getElementById(domId);
    if (!section) {
      const cls = card.wide ? 'card card-wide' : 'card';
      section = h('section', { class: cls, id: domId, 'data-card': card.id, 'aria-labelledby': `${domId}-title` }, [
        h('h2', { id: `${domId}-title` }, [card.title]),
        h('div', { class: 'card-body' }),
      ]);
    }
    sections.push(section);
    const heading = section.querySelector('h2');
    if (heading && heading.textContent !== card.title) heading.textContent = card.title;
    /** @type {unknown} */
    let data;
    let key;
    try {
      data = card.select(state);
      key = JSON.stringify(data) ?? 'undefined';
    } catch (error) {
      data = undefined;
      key = `select-error:${String(error)}`;
    }
    if (rendered.get(card.id) === key) continue;
    rendered.set(card.id, key);
    const body = section.querySelector('.card-body');
    if (!body) continue;
    try {
      if (key.startsWith('select-error:')) throw new Error(key.slice('select-error:'.length));
      const node = card.render(data, state);
      if (body.childNodes.length !== 1 || body.firstChild !== node) body.replaceChildren(node);
    } catch (error) {
      body.replaceChildren(h('p', { class: 'error' }, [`Ошибка карточки: ${String(error)}`]));
    }
  }
  const wanted = new Set(sections);
  for (const node of Array.from(container.querySelectorAll(':scope > section[data-card]'))) {
    if (wanted.has(/** @type {HTMLElement} */ (node))) continue;
    rendered.delete(/** @type {HTMLElement} */ (node).dataset['card'] ?? '');
    node.remove();
  }
  // Move sections only when the order differs, so focused controls are not detached needlessly.
  const current = Array.from(container.querySelectorAll(':scope > section[data-card]'));
  if (current.length !== sections.length || current.some((node, i) => node !== sections[i])) container.append(...sections);
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

/** True while a poll is running. */
let inFlight = false;
/** Set when loop() is called during a poll; one more poll follows right after it. */
let again = false;

/** Polls forever; the next poll starts after the previous one finishes. */
async function loop() {
  if (inFlight) {
    again = true;
    return;
  }
  clearTimeout(timer);
  inFlight = true;
  try {
    do {
      again = false;
      await refresh();
    } while (again);
  } finally {
    inFlight = false;
  }
  timer = setTimeout(loop, POLL_MS);
}

setRefreshHandler(() => void loop());

/** Helpers given to panel extensions (see PANEL_EXTENSIONS). */
const shell = Object.freeze({
  registerCard,
  registerCardGroup,
  requestRefresh,
  api,
  ApiError,
  dom: Object.freeze({ h, facts, pill, code, notice, plainInput }),
});

/**
 * Loads the panel extensions; a failing extension becomes a card with the error.
 * @param {string[]} urls
 */
async function loadExtensions(urls) {
  for (const url of urls) {
    try {
      const extension = await import(url);
      await extension.install(shell);
    } catch (error) {
      const message = `Не удалось загрузить ${url}: ${error instanceof Error ? error.message : String(error)}`;
      registerCard({ id: `extension-${url.replace(/[^a-z0-9]+/gi, '-')}`, title: 'Ошибка панели', order: 1000, select: () => message, render: () => h('p', { class: 'error' }, [message]) });
    }
  }
}

await loadExtensions(PANEL_EXTENSIONS);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void loop();
});

void loop();
