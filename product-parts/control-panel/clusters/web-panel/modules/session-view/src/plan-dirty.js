// @ts-check
// The warning of the plan card about paths outside commits (spec M37 2.4): while they are there
// Kit refuses to close the plan; «Попросить агента убрать» asks the owner session to tidy them.

/** Paths the warning names; the rest goes as «и ещё N». */
export const DIRTY_PATHS = 5;

/**
 * @param {readonly string[]} paths
 * @returns {{ shown: string[], more: number }}
 */
export function dirtyParts(paths) {
  return { shown: paths.slice(0, DIRTY_PATHS), more: Math.max(0, paths.length - DIRTY_PATHS) };
}

/**
 * The warning as plain text (the card draws the paths as code).
 * @param {readonly string[]} paths
 */
export function dirtyText(paths) {
  const { shown, more } = dirtyParts(paths);
  return `В папке проекта есть файлы вне коммитов: ${shown.join(', ')}${more > 0 ? ` (и ещё ${more})` : ''}. Пока они есть, план не закроется.`;
}

/**
 * @param {typeof import('../../panel-shell/src/dom.js').h} h
 * @param {readonly string[]} paths
 * @param {HTMLElement} tidy the «Попросить агента убрать» button
 * @returns {HTMLElement | null} null on a clean tree
 */
export function dirtyBlock(h, paths, tidy) {
  if (paths.length === 0) return null;
  const { shown, more } = dirtyParts(paths);
  /** @type {Array<string | HTMLElement>} */
  const line = ['В папке проекта есть файлы вне коммитов: '];
  shown.forEach((file, index) => line.push(...(index > 0 ? [', '] : []), h('code', {}, [file])));
  line.push(`${more > 0 ? ` (и ещё ${more})` : ''}. Пока они есть, план не закроется.`);
  return h('div', { class: 'sv-dirty' }, [h('p', { class: 'sv-warn' }, line), h('div', { class: 'row' }, [tidy])]);
}
