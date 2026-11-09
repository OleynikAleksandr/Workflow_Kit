// @ts-check
// Plan reviewer sessions the project tree does not list (spec M4 13.4, 13.9): known by the
// review's reviewer key, and before that by the reference its creation returned.

/**
 * @param {Record<string, unknown>} state /api/state
 * @returns {(info: { provider?: string, localId?: string | null, remoteId?: string | null }, key: string) => boolean}
 */
export function reviewerMatcher(state) {
  const reviews = state['reviews'];
  const projects = typeof reviews === 'object' && reviews !== null ? /** @type {Record<string, unknown>} */ (reviews)['projects'] : null;
  const keys = new Set();
  const refs = new Set();
  for (const list of Object.values(typeof projects === 'object' && projects !== null ? projects : {})) {
    for (const r of Array.isArray(list) ? list : []) {
      if (typeof r?.reviewerKey === 'string') keys.add(r.reviewerKey);
      const ref = r?.reviewerRef;
      if (!ref || typeof r?.reviewerProvider !== 'string') continue;
      for (const id of [ref.localId, ref.remoteId]) if (typeof id === 'string' && id) refs.add(`${r.reviewerProvider}:${id}`);
    }
  }
  return (info, key) =>
    keys.has(key) ||
    [info.localId, info.remoteId].some((id) => typeof id === 'string' && id !== '' && refs.has(`${info.provider}:${id}`));
}
