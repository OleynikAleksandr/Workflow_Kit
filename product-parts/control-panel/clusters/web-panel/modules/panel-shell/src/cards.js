// @ts-check
// Card registry of the panel. Cards register themselves on import; app.js renders them in order.

/**
 * @typedef {Record<string, unknown>} PanelState
 * The JSON of GET /api/state.
 */

/**
 * @typedef {object} CardDefinition
 * @property {string} id Unique card id, also the DOM id suffix.
 * @property {string} title Card heading.
 * @property {number} order Sort key; smaller cards come first.
 * @property {boolean} [wide] Spans the full width of the grid.
 * @property {(state: PanelState) => unknown} select Picks the part of the state the card shows;
 *   the card is re-rendered only when this value changes.
 * @property {(data: any, state: PanelState) => Node} render Builds the card body. A card with its
 *   own interactive state (forms, pickers) may return the same node every time; it is then kept
 *   in place so focus and typed text survive the update.
 */

/** @type {CardDefinition[]} */
const cards = [];

/**
 * Registers a card; a duplicate id replaces the previous definition.
 * @param {CardDefinition} card
 */
export function registerCard(card) {
  const index = cards.findIndex((c) => c.id === card.id);
  if (index >= 0) cards.splice(index, 1, card);
  else cards.push(card);
}

/**
 * Registered cards sorted by order.
 * @returns {CardDefinition[]}
 */
export function listCards() {
  return [...cards].sort((a, b) => a.order - b.order);
}

/** @type {() => void} */
let refreshHandler = () => undefined;

/**
 * Sets what requestRefresh() does (app.js: poll /api/state now).
 * @param {() => void} handler
 */
export function setRefreshHandler(handler) {
  refreshHandler = handler;
}

/** Asks the panel to fetch /api/state right away, e.g. after a successful action. */
export function requestRefresh() {
  refreshHandler();
}
