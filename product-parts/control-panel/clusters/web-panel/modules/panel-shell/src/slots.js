// @ts-check
// Slots of the layout that panel extensions fill: the new project screen (wizard), the body of the
// session screen and «Ревью плана» in the sidebar. An empty slot falls back to the shell's own view.

/**
 * @typedef {import('./view-model.js').ProjectRow} ProjectRow
 * @typedef {import('./view-model.js').SessionRow} SessionRow
 * @typedef {import('./view-model.js').Route} Route
 */

/**
 * What a slot gets besides the state.
 * @typedef {object} SlotContext
 * @property {(route: Route) => void} navigate
 * @property {() => void} requestRefresh
 * @property {(tone: 'ok' | 'error' | 'muted', text: string, error?: unknown) => void} say
 * @property {(projectId: string) => void} selectProject makes the project the one the sidebar tree shows
 * @property {(projectId: string, key: string) => void} [openSession] opens a just created session
 *   by itself once it is in the tree (the screen and, for a provider with chat links, its chat)
 */

/**
 * The selected session of the session screen.
 * @typedef {object} SessionContext
 * @property {ProjectRow} project
 * @property {SessionRow} session
 * @property {string | null} link Chat link for this device.
 * @property {{ text: string, tone: 'ok' | 'muted' | 'error' } | null} [status] A resumable provider:
 *   the session process instead of a chat link (it is revived when the screen opens).
 */

/**
 * @typedef {object} NewProjectSlot
 * @property {(ctx: SlotContext) => { element: HTMLElement, show: (mode: 'create' | 'open', state: Record<string, unknown>, entered: boolean) => void }} create
 *   show() runs on every render of the screen; entered is true when the route has just changed to it.
 */

/**
 * @typedef {object} SessionSlot
 * @property {(state: Record<string, unknown>, session: SessionContext) => unknown} select Data of the slot;
 *   it is re-rendered only when this value changes.
 * @property {(data: any, state: Record<string, unknown>, session: SessionContext, ctx: SlotContext) => Node | null} render
 */

/**
 * @typedef {object} SlotMap
 * @property {NewProjectSlot | null} newProject
 * @property {SessionSlot | null} sessionBody
 * @property {SessionSlot | null} sessionReview
 */

/** @type {SlotMap} */
export const slots = { newProject: null, sessionBody: null, sessionReview: null };

/**
 * Fills a slot; a second call replaces the previous definition.
 * @param {'newProject' | 'sessionBody' | 'sessionReview'} name
 * @param {NewProjectSlot | SessionSlot} definition
 */
export function registerSlot(name, definition) {
  if (name === 'newProject') slots.newProject = /** @type {NewProjectSlot} */ (definition);
  else if (name === 'sessionBody' || name === 'sessionReview') slots[name] = /** @type {SessionSlot} */ (definition);
  else throw new Error(`Unknown panel slot: ${String(name)}`);
}
