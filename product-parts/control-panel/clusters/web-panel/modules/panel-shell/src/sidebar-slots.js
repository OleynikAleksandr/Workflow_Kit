// @ts-check
import { slots } from './slots.js';
import { slotPart } from './session-screen.js';

/** Keeps the selected session's workflow and review slots below the project tree.
 * @param {{ scroller: HTMLElement, review: HTMLElement, session: HTMLElement }} sidebar
 * @param {import('./slots.js').SlotContext} ctx
 */
export function createSidebarSlots(sidebar, ctx) {
  const workflow = slotPart(sidebar.session, 'Ошибка карточек сессии');
  const review = slotPart(sidebar.review, 'Ошибка ревью плана');
  const scrolls = new Map();
  let previous = '';
  return {
    /** @param {import('./view-model.js').Route} route
     * @param {import('./view-model.js').ProjectRow[]} tree @param {Record<string, unknown>} state
     */
    render(route, tree, state) {
      const project = route.screen === 'session' ? tree.find((p) => p.id === route.projectId) : null;
      const session = route.screen === 'session' ? project?.sessions.find((s) => s.key === route.key) : null;
      const key = project && session ? `${project.id}\n${session.key}` : '';
      const changed = previous !== key;
      if (changed && previous) scrolls.set(previous, sidebar.scroller.scrollTop);
      if (project && session) {
        const data = { project, session, link: null };
        review.draw(slots.sessionReview, state, data, ctx);
        workflow.draw(slots.sessionSidebar, state, data, ctx);
      } else {
        sidebar.review.replaceChildren();
        sidebar.session.replaceChildren();
        // Clear the drawn keys too: returning to the same session must reattach its nodes.
        const empty = /** @type {import('./slots.js').SessionContext} */ ({});
        review.draw(null, state, empty, ctx);
        workflow.draw(null, state, empty, ctx);
      }
      if (changed) sidebar.scroller.scrollTop = scrolls.get(key) ?? 0;
      previous = key;
      return sidebar.session.querySelector('[data-needs-attention="true"]') !== null;
    },
  };
}
