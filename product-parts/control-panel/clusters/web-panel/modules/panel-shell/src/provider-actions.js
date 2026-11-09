// @ts-check
// Provider-level actions on the screen of an existing project: what a provider offers for itself
// (start its daemon, sign in, remove its global hook), whether it is ready or not. No DOM; node --test.

/**
 * @typedef {object} ProviderActionRow
 * @property {string} provider
 * @property {string} id
 * @property {string} label «<provider>: <action>»
 * @property {string | null} confirm question asked before the action runs
 */

/**
 * @param {unknown} value
 * @returns {Record<string, any>}
 */
function record(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? /** @type {Record<string, any>} */ (value) : {};
}

/** @param {unknown} value @returns {string | null} */
function text(value) {
  return typeof value === 'string' && value !== '' ? value : null;
}

/**
 * Enabled actions with scope "provider" of every provider of the "providers" section, in the
 * order of the section.
 * @param {Record<string, unknown>} state
 * @returns {ProviderActionRow[]}
 */
export function providerActionRows(state) {
  const summaries = record(state['providers'])['providers'];
  /** @type {ProviderActionRow[]} */
  const rows = [];
  for (const entry of Array.isArray(summaries) ? summaries : []) {
    const summary = record(entry);
    const provider = text(summary['id']);
    if (!provider) continue;
    const name = text(summary['label']) ?? text(summary['title']) ?? provider;
    for (const item of Array.isArray(summary['actions']) ? summary['actions'] : []) {
      const action = record(item);
      const id = text(action['id']);
      if (!id || action['scope'] !== 'provider' || action['enabled'] !== true) continue;
      rows.push({ provider, id, label: `${name}: ${text(action['title']) ?? id}`, confirm: text(action['confirm']) });
    }
  }
  return rows;
}
