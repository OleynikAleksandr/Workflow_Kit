// @ts-check
// Which project the sidebar tree shows and how rows of the archive lists are chosen (pure).

/** @typedef {import('./view-model.js').Route} Route */
/** @typedef {import('./view-model.js').ProjectRow} ProjectRow */
/** @typedef {import('./view-model.js').SessionRow} SessionRow */

/**
 * The project the sidebar tree shows: the one of the route, else the one chosen last, when it is
 * still among the active projects; null when there is none.
 * @param {Route} route
 * @param {string | null} remembered
 * @param {readonly string[]} activeIds
 * @returns {string | null}
 */
export function currentProjectId(route, remembered, activeIds) {
  const fromRoute = 'projectId' in route ? route.projectId : null;
  for (const id of [fromRoute, remembered]) {
    if (id && activeIds.includes(id)) return id;
  }
  return null;
}

/**
 * @typedef {SessionRow & { projectId: string, projectName: string }} ArchivedSessionRow
 */

/**
 * Sessions put into the archive across the active projects, newest first.
 * @param {ProjectRow[]} tree
 * @returns {ArchivedSessionRow[]}
 */
export function archivedSessions(tree) {
  return tree
    .flatMap((project) => project.archived.map((session) => ({ ...session, projectId: project.id, projectName: project.name })))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Rows chosen by a click in a list (Workflow Pilot archive): a plain click selects one row,
 * ⌘/Ctrl toggles it, Shift selects the range from the anchor.
 * @param {readonly string[]} ids rows in their order
 * @param {readonly string[]} selected
 * @param {string | null} anchor
 * @param {string} id the clicked row
 * @param {{ toggle?: boolean, range?: boolean }} mods
 * @returns {{ selected: string[], anchor: string }}
 */
export function selectRows(ids, selected, anchor, id, mods) {
  if (mods.range && anchor && ids.includes(anchor)) {
    const a = ids.indexOf(anchor);
    const b = ids.indexOf(id);
    return { selected: ids.slice(Math.min(a, b), Math.max(a, b) + 1), anchor };
  }
  if (mods.toggle) {
    return { selected: selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id], anchor: id };
  }
  return { selected: [id], anchor: id };
}
