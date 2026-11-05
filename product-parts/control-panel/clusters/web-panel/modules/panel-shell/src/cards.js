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
 * @property {(state: PanelState) => unknown} select Picks the part of the state the card shows;
 *   the card is re-rendered only when this value changes.
 * @property {(data: any, state: PanelState) => Node} render Builds the card body.
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
