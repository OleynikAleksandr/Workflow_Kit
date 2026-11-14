// @ts-check
// The card of a started plan seen from a session that does not own it (spec M31 3.4): the plan
// objective, who runs it, the progress and «Открыть сессию». No plan buttons.

/**
 * @param {typeof import('../../panel-shell/src/dom.js').h} h
 * @param {import('./plan-cards.js').ForeignPlanView} view
 * @param {(key: string) => void} open opens the owner session
 * @returns {HTMLElement}
 */
export function foreignPlanCard(h, view, open) {
  const bar = h('i');
  bar.style.width = `${view.percent}%`;
  const ownerKey = view.ownerKey;
  const button = ownerKey
    ? h('button', { class: 'btn', type: 'button' }, ['Открыть сессию'])
    : null;
  if (button && ownerKey) button.addEventListener('click', () => open(ownerKey));
  return h('div', { class: 'plan-card sv-foreign' }, [
    h('h2', {}, [view.objective || 'План']),
    h('p', { class: 'sv-muted' }, [view.ownerLine]),
    h('div', { class: 'bar' }, [bar]),
    h('div', { class: 'count' }, [view.progressLabel]),
    button ? h('div', { class: 'row' }, [button]) : null,
  ].filter((n) => n !== null));
}
