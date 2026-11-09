// @ts-check
// The grid of service cards (system, structure, providers) shown inside «Настройки».
import { expandCards } from './cards.js';
import { h } from './dom.js';

/** @type {Map<string, string>} Last rendered selection per card, to skip unchanged cards. */
const rendered = new Map();

/**
 * Renders the registered cards into a container, re-rendering only those whose data changed;
 * keeps the sections in card order and removes the cards that disappeared.
 * @param {HTMLElement} container
 * @param {Record<string, unknown>} current
 */
export function renderCards(container, current) {
  /** @type {HTMLElement[]} */
  const sections = [];
  for (const card of expandCards(current)) {
    const domId = `card-${card.id}`;
    let section = document.getElementById(domId);
    if (!section) {
      section = h('section', { class: card.wide ? 'card card-wide' : 'card', id: domId, 'data-card': card.id, 'aria-labelledby': `${domId}-title` }, [
        h('h2', { id: `${domId}-title` }, [card.title]),
        h('div', { class: 'card-body' }),
      ]);
    }
    sections.push(section);
    const heading = section.querySelector('h2');
    if (heading && heading.textContent !== card.title) heading.textContent = card.title;
    /** @type {unknown} */
    let data;
    let key;
    try {
      data = card.select(current);
      key = JSON.stringify(data) ?? 'undefined';
    } catch (error) {
      key = `select-error:${String(error)}`;
    }
    if (rendered.get(card.id) === key) continue;
    rendered.set(card.id, key);
    const body = section.querySelector('.card-body');
    if (!body) continue;
    try {
      if (key.startsWith('select-error:')) throw new Error(key.slice('select-error:'.length));
      const node = card.render(data, current);
      if (body.childNodes.length !== 1 || body.firstChild !== node) body.replaceChildren(node);
    } catch (error) {
      body.replaceChildren(h('p', { class: 'error' }, [`Ошибка карточки: ${String(error)}`]));
    }
  }
  const wanted = new Set(sections);
  for (const node of Array.from(container.querySelectorAll(':scope > section[data-card]'))) {
    if (wanted.has(/** @type {HTMLElement} */ (node))) continue;
    rendered.delete(/** @type {HTMLElement} */ (node).dataset['card'] ?? '');
    node.remove();
  }
  const current2 = Array.from(container.querySelectorAll(':scope > section[data-card]'));
  if (current2.length !== sections.length || current2.some((node, i) => node !== sections[i])) container.append(...sections);
}
