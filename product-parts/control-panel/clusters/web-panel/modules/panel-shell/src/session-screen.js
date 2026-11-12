// @ts-check
// The session screen: its header, the "sessionBody" slot and, under it, the "sessionChat" slot.
// The screen keeps its nodes, so typed text in the slot cards survives polling, and each part is
// redrawn only when its data changed.
import { h } from './dom.js';
import { sessionHeader } from './screens.js';
import { slots } from './slots.js';

/**
 * @typedef {import('./slots.js').SessionContext} SessionContext
 * @typedef {import('./slots.js').SessionSlot} SessionSlot
 * @typedef {import('./slots.js').SlotContext} SlotContext
 */

/**
 * One slot container of the session screen.
 * @param {HTMLElement} host
 * @param {string} errorLabel
 */
function slotPart(host, errorLabel) {
  let drawnKey = '';
  return {
    /**
     * @param {SessionSlot | null} slot
     * @param {Record<string, unknown>} state
     * @param {SessionContext} data
     * @param {SlotContext} ctx
     */
    draw(slot, state, data, ctx) {
      if (!slot) return;
      try {
        const selected = slot.select(state, data);
        const key = JSON.stringify([data.session.key, selected]);
        if (key === drawnKey) return;
        drawnKey = key;
        const node = slot.render(selected, state, data, ctx);
        if (!node) host.replaceChildren();
        else if (host.childNodes.length !== 1 || host.firstChild !== node) host.replaceChildren(node);
      } catch (error) {
        drawnKey = '';
        host.replaceChildren(h('p', { class: 'error' }, [`${errorLabel}: ${String(error)}`]));
      }
    },
  };
}

/**
 * «Продолжить» of an external session the panel does not run (M19 2.3): the panel starts its own
 * process on purpose. Null for any other session.
 * @param {SessionContext} data
 * @param {((projectId: string, session: SessionContext['session']) => void) | undefined} resume
 * @returns {HTMLElement | null}
 */
export function resumeButton(data, resume) {
  const { project, session } = data;
  if (!resume || !session.external || !session.resumable || session.state === 'running') return null;
  const node = h('button', { type: 'button', class: 'btn primary' }, ['Продолжить']);
  node.addEventListener('click', () => resume(project.id, session));
  return h('div', { class: 'row' }, [node]);
}

/**
 * Creates the session screen; render() runs on every render of the panel while it is shown.
 * @param {SlotContext} ctx
 * @param {{ resume?: (projectId: string, session: SessionContext['session']) => void }} [options]
 */
export function createSessionScreen(ctx, options = {}) {
  const head = h('div');
  const body = h('div', { class: 'session-body' });
  const chat = h('div', { class: 'session-chat' });
  const element = h('div', { class: 'screen' }, [head, body, chat]);
  const bodyPart = slotPart(body, 'Ошибка экрана сессии');
  const chatPart = slotPart(chat, 'Ошибка диалога сессии');
  let headKey = '';
  return {
    element,
    /**
     * @param {SessionContext} data
     * @param {Record<string, unknown>} state
     */
    render(data, state) {
      const key = JSON.stringify(data);
      if (key !== headKey) {
        headKey = key;
        head.replaceChildren(...[sessionHeader(data), resumeButton(data, options.resume)].filter((n) => n !== null));
      }
      bodyPart.draw(slots.sessionBody, state, data, ctx);
      chatPart.draw(slots.sessionChat, state, data, ctx);
    },
  };
}
