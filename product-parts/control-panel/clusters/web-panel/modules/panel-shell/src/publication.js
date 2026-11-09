// @ts-check
// The «GitHub» line of the project screen (spec publication-order, section 3.2): published, ready
// with the publish button, or why publishing waits. No line without an upstream.

/**
 * @param {number} n
 * @returns {string} «1 коммит», «3 коммита», «5 коммитов»
 */
export function commitsLabel(n) {
  const tens = n % 100;
  const ones = n % 10;
  const word = tens >= 11 && tens <= 14 ? 'коммитов' : ones === 1 ? 'коммит' : ones >= 2 && ones <= 4 ? 'коммита' : 'коммитов';
  return `${n} ${word}`;
}

/**
 * @typedef {object} PublicationView
 * @property {'ok' | 'muted' | 'warn'} tone
 * @property {string} text
 * @property {string | null} button label of the publish button, null when publishing waits
 */

/**
 * @param {Record<string, unknown>} state /api/state
 * @param {string} projectId
 * @returns {PublicationView | null}
 */
export function publicationView(state, projectId) {
  const section = /** @type {any} */ (state['publication']);
  const entry = section && typeof section === 'object' ? section.projects?.[projectId] : null;
  if (!entry || typeof entry !== 'object' || entry.status === 'none') return null;
  const ahead = Number(entry.ahead) || 0;
  const branch = typeof entry.branch === 'string' ? entry.branch : '';
  if (entry.status === 'up-to-date') return { tone: 'ok', text: `Опубликовано, ветка ${branch} совпадает с ${entry.upstream}`, button: null };
  if (entry.status === 'ready') return { tone: 'muted', text: `Неопубликованных коммитов: ${ahead}`, button: `Опубликовать на GitHub (${commitsLabel(ahead)})` };
  const reason = typeof entry.reason === 'string' ? entry.reason : 'публикация сейчас невозможна';
  return { tone: 'warn', text: ahead > 0 ? `Неопубликованных коммитов: ${ahead} · ${reason}` : reason, button: null };
}
