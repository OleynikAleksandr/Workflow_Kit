// @ts-check
// The decision card of a Kit request (spec M40 2.2): what exactly the user allows and one button.
// The button sends the request id and digest the card shows; a changed request answers
// DECISION_STALE and the next poll shows the new card.
import { decisionBody } from './decision-model.js';

/** @typedef {import('./decision-model.js').DecisionCardView} DecisionCardView */
/** @typedef {import('../../panel-shell/src/slots.js').SlotContext} SlotContext */

/**
 * @param {import('./session-view.js').Shell} shell
 * @param {DecisionCardView[]} cards
 * @param {string} projectId
 * @param {string} key
 * @param {SlotContext} ctx
 * @returns {HTMLElement}
 */
export function decisionCards(shell, cards, projectId, key, ctx) {
  const { h } = shell.dom;
  let busy = false;
  /** @param {DecisionCardView} card @param {HTMLButtonElement} node */
  const press = async (card, node) => {
    if (busy) return;
    busy = true;
    node.disabled = true;
    node.setAttribute('aria-busy', 'true');
    try {
      await shell.api('POST', `/api/projects/${encodeURIComponent(projectId)}/workflow/decision`, decisionBody(card, key));
    } catch (error) {
      ctx.say('error', `Не удалось: ${card.button}`, error);
    } finally {
      busy = false;
      node.disabled = false;
      node.removeAttribute('aria-busy');
      ctx.requestRefresh();
    }
  };
  return h('div', { class: 'sv-decisions' }, cards.map((card) => {
    const titleId = `sv-decision-${card.id}`;
    const node = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: card.kind === 'unblock' ? 'btn primary' : 'btn warn', 'aria-describedby': titleId }, [card.button]));
    node.addEventListener('click', () => void press(card, node));
    const list = card.items.length === 0
      ? null
      : card.items.length === 1 && !card.code
        ? h('p', { class: 'sv-warn' }, [card.items[0] ?? ''])
        : h('ul', { class: 'sv-decision-items' }, card.items.map((item) => h('li', {}, [card.code ? h('code', {}, [item]) : item])));
    return h('section', { class: 'choice sv-decision', 'aria-labelledby': titleId, 'data-kind': card.kind }, [
      h('div', { class: 'eyebrow' }, ['Выбор пользователя']),
      h('h2', { id: titleId }, [card.title]),
      h('p', { class: 'sv-muted' }, [card.lead]),
      list,
      h('div', { class: 'row' }, [node]),
    ].filter((n) => n !== null));
  }));
}
