// @ts-check
// Kit of the project screen (spec M22 section 2.7): the line «Kit <version>» or «Kit не
// установлен» under the project name, and for an older Kit the card «Kit 2.2.3 → 2.2.4» with the
// button «Обновить Kit» — the button is the consent, nothing else is asked. The card shows the
// update while it runs, its outcome (and what happened to the Codex hooks) or Kit's error with its
// next step. The model reads the "kitUpdate" section of /api/state only.
import { h } from './dom.js';

/** Explanation of the card before the update. */
export const KIT_UPDATE_TEXT = 'Kit обновит свои файлы и хуки проекта одним коммитом; сессии, начатые до обновления, получат новый пакет со следующей сессии.';
/** States of a folder whose Kit is installed (kit-update). */
const INSTALLED = new Set(['KIT_OK', 'KIT_OUTDATED', 'KIT_DAMAGED']);

/**
 * @typedef {object} KitCard
 * @property {'muted' | 'ok' | 'error'} tone
 * @property {string} title «Kit 2.2.3 → 2.2.4», «Kit обновлён до 2.2.4»
 * @property {string} text
 * @property {string[]} lines what Kit did with the hooks, or its next step after an error
 * @property {string | null} button «Обновить Kit», null while it runs or after a success
 * @property {boolean} running
 */

/**
 * @typedef {object} KitView
 * @property {string} line «Kit 2.2.4», «Kit не установлен», «Kit: <why the state is unknown>»
 * @property {boolean} missing no Kit in the folder: the line offers «Открыть папку проекта»
 * @property {KitCard | null} card
 */

/**
 * @param {unknown} value
 * @returns {string | null}
 */
const text = (value) => (typeof value === 'string' && value !== '' ? value : null);

/**
 * The Kit line and card of a project, or null before the service has read its Kit.
 * @param {Record<string, unknown>} state /api/state
 * @param {string} projectId
 * @returns {KitView | null}
 */
export function kitView(state, projectId) {
  const section = /** @type {any} */ (state['kitUpdate']);
  const entry = section && typeof section === 'object' ? section.projects?.[projectId] : null;
  if (!entry || typeof entry !== 'object') return null;
  const installed = text(entry.installed);
  const bundled = text(entry.bundled) ?? '';
  const folder = text(entry.state);
  const missing = installed === null && folder !== null && !INSTALLED.has(folder);
  // The note of kit-update already starts with «Kit: ».
  const line = installed !== null ? `Kit ${installed}` : missing ? 'Kit не установлен' : text(entry.note) ?? 'Kit: версия ещё не проверена';
  const arrow = `Kit ${installed ?? '—'} → ${bundled}`;
  /** @type {KitCard | null} */
  let card = null;
  if (entry.running === true) {
    card = { tone: 'muted', title: arrow, text: 'Kit обновляется…', lines: [], button: null, running: true };
  } else if (entry.error && typeof entry.error === 'object') {
    const next = text(entry.error.nextAction);
    card = {
      tone: 'error',
      title: arrow,
      text: `Kit не обновлён: ${text(entry.error.message) ?? text(entry.error.code) ?? 'ошибка'}`,
      lines: next ? [`Следующий шаг: ${next}`] : [],
      button: entry.action === 'update' ? 'Обновить Kit' : null,
      running: false,
    };
  } else if (entry.last && typeof entry.last === 'object') {
    const hooks = Array.isArray(entry.last.hooks) ? entry.last.hooks.filter((/** @type {unknown} */ l) => typeof l === 'string') : [];
    const commit = text(entry.last.commit);
    card = {
      tone: 'ok',
      title: `Kit обновлён до ${text(entry.last.to) ?? bundled}`,
      text: `${commit ? `Коммит ${commit.slice(0, 7)}. ` : ''}Сессии, начатые до обновления, получат новый пакет со следующей сессии.`,
      lines: hooks,
      button: null,
      running: false,
    };
  } else if (entry.action === 'update') {
    card = { tone: 'muted', title: arrow, text: KIT_UPDATE_TEXT, lines: [], button: 'Обновить Kit', running: false };
  }
  return { line, missing, card };
}

/**
 * The Kit line of the project header: the version, or «Kit не установлен» with a button that opens
 * the wizard «Открыть папку проекта».
 * @param {KitView} view
 * @param {() => void} openFolder
 * @returns {Array<Node | string>}
 */
export function kitLine(view, openFolder) {
  if (!view.missing) return [view.line];
  const link = h('button', { type: 'button', class: 'kit-link' }, ['«Открыть папку проекта»']);
  link.addEventListener('click', openFolder);
  return [`${view.line} — `, link];
}

/**
 * The card «Обновить Kit».
 * @param {KitCard} card
 * @param {() => Promise<void>} update
 * @returns {HTMLElement}
 */
export function kitPanel(card, update) {
  const tone = card.tone === 'error' ? 'pub-warn' : card.tone === 'ok' ? 'pub-ok' : 'pub-muted';
  /** @type {Array<Node | null>} */
  const children = [
    h('h2', {}, [card.title]),
    h('p', { class: tone }, [card.text]),
    card.lines.length > 0 ? h('ul', { class: 'checks' }, card.lines.map((l) => h('li', {}, [l]))) : null,
  ];
  if (card.button) {
    const node = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'btn primary' }, [card.button]));
    node.addEventListener('click', () => {
      node.disabled = true;
      node.textContent = 'Kit обновляется…';
      void update().finally(() => (node.disabled = false));
    });
    children.push(node);
  }
  return h('div', { class: 'panel' }, children.filter((n) => n !== null));
}
