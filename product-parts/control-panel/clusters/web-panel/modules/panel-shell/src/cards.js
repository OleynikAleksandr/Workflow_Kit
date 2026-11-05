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

/**
 * @typedef {object} CardGroupItem
 * @property {string} id Item id, unique inside the group ([a-z0-9-] recommended; part of the DOM id).
 * @property {string} title Heading of the item's card.
 */

/**
 * @typedef {object} CardGroupDefinition
 * A set of cards whose number depends on the state (e.g. one card per provider).
 * @property {string} id Unique group id; an item card gets the id "<group>-<item>".
 * @property {number} order Sort key of every card of the group.
 * @property {boolean} [wide]
 * @property {(state: PanelState) => CardGroupItem[]} items Cards to draw for this state, in order.
 * @property {(state: PanelState, itemId: string) => unknown} select Data of one item card.
 * @property {(data: any, state: PanelState, itemId: string) => Node} render Body of one item card.
 */

/** @type {CardDefinition[]} */
const cards = [];
/** @type {CardGroupDefinition[]} */
const groups = [];

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
 * Registers a card group; a duplicate id replaces the previous definition.
 * @param {CardGroupDefinition} group
 */
export function registerCardGroup(group) {
  const index = groups.findIndex((g) => g.id === group.id);
  if (index >= 0) groups.splice(index, 1, group);
  else groups.push(group);
}

/**
 * Registered cards sorted by order.
 * @returns {CardDefinition[]}
 */
export function listCards() {
  return [...cards].sort((a, b) => a.order - b.order);
}

/**
 * Cards to draw for a state: plain cards plus one card per group item, sorted by order (stable).
 * A group whose items() throws becomes one card that shows the error.
 * @param {PanelState} state
 * @returns {CardDefinition[]}
 */
export function expandCards(state) {
  /** @type {CardDefinition[]} */
  const expanded = [...cards];
  for (const group of groups) {
    /** @type {CardGroupItem[]} */
    let items;
    try {
      items = group.items(state);
    } catch (error) {
      const message = String(error);
      expanded.push({ id: group.id, title: group.id, order: group.order, wide: group.wide, select: () => message, render: () => { throw new Error(message); } });
      continue;
    }
    for (const item of items) {
      expanded.push({
        id: `${group.id}-${item.id}`,
        title: item.title,
        order: group.order,
        wide: group.wide,
        select: (s) => group.select(s, item.id),
        render: (data, s) => group.render(data, s, item.id),
      });
    }
  }
  return expanded.sort((a, b) => a.order - b.order);
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
