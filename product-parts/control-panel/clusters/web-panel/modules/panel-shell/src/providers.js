// @ts-check
// Providers of the panel as the service reports them (the "providers" section of /api/state):
// names, letters, who brings a session back, the connection indicators. The panel keeps no list
// of its own, so a provider registered in the service appears here by itself. No DOM; node --test.

/**
 * @typedef {object} ProviderView
 * @property {string} id
 * @property {string} label short name on buttons and badges
 * @property {string} mark letter of the provider button
 * @property {boolean} resume the provider brings a session without a live process back
 * @property {boolean} ready the last status of the provider is "ready"
 * @property {string} statusLabel status text for the tooltip of the indicator
 */

/**
 * @typedef {object} Indicator
 * @property {string} id
 * @property {string} label
 * @property {boolean} ok
 * @property {string} title Tooltip with the reason.
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
 * Providers in the order of the service (the order of its registry).
 * @param {Record<string, unknown>} state
 * @returns {ProviderView[]}
 */
export function providerViews(state) {
  const summaries = record(state['providers'])['providers'];
  /** @type {ProviderView[]} */
  const views = [];
  for (const entry of Array.isArray(summaries) ? summaries : []) {
    const summary = record(entry);
    const id = text(summary['id']);
    if (!id) continue;
    const label = text(summary['label']) ?? text(summary['title']) ?? id;
    const status = record(summary['status']);
    views.push({
      id,
      label,
      mark: text(summary['mark']) ?? label.slice(0, 1).toUpperCase(),
      resume: summary['resume'] === true,
      ready: status['state'] === 'ready',
      statusLabel: text(status['label']) ?? 'нет сведений',
    });
  }
  return views;
}

/**
 * Provider name for the user by its id; an unknown id stays as it is.
 * @param {Record<string, unknown>} state
 * @returns {(id: string) => string}
 */
export function providerNamer(state) {
  const labels = new Map(providerViews(state).map((p) => [p.id, p.label]));
  return (id) => labels.get(id) ?? id;
}

/**
 * Names of the providers in a sentence: «ChatGPT и Claude», «ChatGPT, Claude и Kimi»; without
 * providers — «приложениях провайдеров» (the texts say «в …»).
 * @param {Record<string, unknown>} state
 * @returns {string}
 */
export function providerNames(state) {
  const names = providerViews(state).map((p) => p.label);
  if (names.length === 0) return 'приложениях провайдеров';
  if (names.length === 1) return String(names[0]);
  return `${names.slice(0, -1).join(', ')} и ${names[names.length - 1]}`;
}

/**
 * Connection indicators of the sidebar foot: the service, every provider, iPad.
 * @param {Record<string, unknown>} state
 * @param {boolean} linked The last poll of /api/state succeeded.
 * @returns {Indicator[]}
 */
export function indicators(state, linked) {
  /** @type {Indicator[]} */
  const list = [{ id: 'service', label: 'Служба', ok: linked, title: linked ? 'Служба отвечает' : 'Нет связи со службой' }];
  for (const p of providerViews(state)) list.push({ id: p.id, label: p.label, ok: linked && p.ready, title: p.statusLabel });
  const addresses = record(state['system'])['addresses'];
  const remote = (Array.isArray(addresses) ? addresses : []).filter((a) => typeof a === 'string' && !a.includes('127.0.0.1'));
  list.push({ id: 'ipad', label: 'iPad · Tailscale', ok: linked && remote.length > 0, title: remote.length > 0 ? remote.join(', ') : 'Адреса Tailscale нет' });
  return list;
}
