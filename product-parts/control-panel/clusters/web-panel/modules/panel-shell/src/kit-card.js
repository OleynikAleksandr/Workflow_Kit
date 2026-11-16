// @ts-check
// Kit of the project screen (spec M22 section 2.7, the structure: M38 section 2.3): the line
// «Kit <version>» or «Kit не установлен» under the project name, and for an older Kit or an older
// Kit structure the card «Kit 2.2.6 → 2.2.7, структура 3 → 4» with the button «Обновить Kit» — the
// button is the consent, nothing else is asked. The card shows the update while it runs, its
// outcome (the structure files, what happened to the Codex hooks) or Kit's error with its next
// step. The model reads the "kitUpdate" section of /api/state only.
import { h } from './dom.js';

/** Explanation of the card before the update. */
export const KIT_UPDATE_TEXT = 'Kit обновит свои файлы, структуру и хуки проекта одним коммитом; сессии, начатые до обновления, получат новые хуки и пакет со следующей сессии.';
/** What the sessions get after the update. */
const AFTER_TEXT = 'Сессии, начатые до обновления, получат новые хуки и пакет со следующей сессии.';
/** States of a folder whose Kit is installed (kit-update). */
const INSTALLED = new Set(['KIT_OK', 'KIT_OUTDATED', 'KIT_DAMAGED']);

/**
 * @typedef {object} KitCard
 * @property {'muted' | 'ok' | 'error'} tone
 * @property {string} title «Kit 2.2.3 → 2.2.4», «Структура Kit 3 → 4», «Kit обновлён до 2.2.4»
 * @property {string} text
 * @property {string[]} lines kept structure files, the structure and the hooks after the update, or Kit's next step after an error
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
 * @param {unknown} value
 * @returns {string[]}
 */
const strings = (value) => (Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []);

/**
 * True when the dotted version `left` is older than `right` (the rule of Kit's installer).
 * @param {string} left
 * @param {string} right
 */
function older(left, right) {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (Number.isNaN(difference)) return false;
    if (difference !== 0) return difference < 0;
  }
  return false;
}

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
  const structure = entry.structure && typeof entry.structure === 'object' ? entry.structure : null;
  const kitOlder = folder === 'KIT_OUTDATED' || (installed !== null && bundled !== '' && older(installed, bundled));
  const structureOlder = structure?.installable === true;
  const structureArrow = structure ? `${structure.installed ?? '—'} → ${structure.version}` : '';
  const kitArrow = `Kit ${installed ?? '—'} → ${bundled}`;
  const arrow = structureOlder && !kitOlder ? `Структура Kit ${structureArrow}` : structureOlder ? `${kitArrow}, структура ${structureArrow}` : kitArrow;
  const kept = strings(structure?.kept);
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
    card = lastCard(entry, bundled);
  } else if (entry.action === 'update') {
    const lines = kept.length > 0 ? [`Изменено вручную, не обновится: ${kept.join(', ')}`] : [];
    card = { tone: 'muted', title: arrow, text: KIT_UPDATE_TEXT, lines, button: 'Обновить Kit', running: false };
  }
  return { line, missing, card };
}

/**
 * The card after an update: the Kit, the structure, or why the structure stayed as it was.
 * @param {any} entry
 * @param {string} bundled
 * @returns {KitCard}
 */
function lastCard(entry, bundled) {
  const last = entry.last;
  const to = text(last.to) ?? bundled;
  const commit = text(last.commit);
  const lines = strings(last.hooks);
  const structure = last.structure && typeof last.structure === 'object' ? last.structure : null;
  const note = text(last.structureNote);
  if (structure) lines.push(`Структура Kit ${structure.from ?? '—'} → ${structure.to}: ${strings(structure.files).join(', ')}`);
  if (note) lines.push(note);
  const kitChanged = text(last.from) !== to;
  if (!kitChanged && !structure && note) {
    return { tone: 'error', title: 'Структура Kit не обновлена', text: note, lines: strings(last.hooks), button: entry.action === 'update' ? 'Обновить Kit' : null, running: false };
  }
  return {
    tone: 'ok',
    title: !kitChanged && structure ? `Структура Kit обновлена до ${structure.to}` : `Kit обновлён до ${to}`,
    text: `${commit ? `Коммит ${commit.slice(0, 7)}. ` : ''}${AFTER_TEXT}`,
    lines,
    button: null,
    running: false,
  };
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
