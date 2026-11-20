// @ts-check
// M48 T005: the autopilot card of a session (spec M48 3.5): the mode «Выкл · После старта ·
// Полный», the review while it may change, what the last switch did; the line that replaces the
// mode choice card under a full run; the presses that wait for a busy Kit. The service applies a
// change to the current task of the session (T002) and answers what it did.
import { SESSION_AUTOPILOT_TEXTS, SESSION_MODES, cardNotes, sessionRefusal } from './session-autopilot-model.js';

/** @typedef {import('./session-autopilot-model.js').SessionAutopilotView} SessionAutopilotView */
/** @typedef {import('../../panel-shell/src/slots.js').SlotContext} SlotContext */

/** Sessions whose record the card asked for (the first read takes the defaults of Settings). */
const asked = new Set();

/**
 * @param {import('./session-view.js').Shell} shell
 * @param {SessionAutopilotView & { note?: string | null }} view
 * @param {string} projectId
 * @param {string} key
 * @param {SlotContext} ctx
 * @returns {HTMLElement}
 */
export function sessionAutopilotCard(shell, view, projectId, key, ctx) {
  const { h } = shell.dom;
  const id = `${projectId}\n${key}`;
  const url = `/api/projects/${encodeURIComponent(projectId)}/sessions/${encodeURIComponent(key)}/autopiloting`;
  if (!view.known && !asked.has(id)) {
    asked.add(id);
    void shell.api('GET', url).catch(() => asked.delete(id)).finally(() => ctx.requestRefresh());
  }
  let busy = false;
  /** @param {{ mode?: string, review?: boolean }} change */
  const save = async (change) => {
    if (busy || !view.known) return;
    busy = true;
    cardNotes.delete(id);
    try {
      await shell.api('POST', url, { expectedRevision: view.revision, ...change });
    } catch (error) {
      cardNotes.set(id, sessionRefusal(/** @type {any} */ (error)));
    } finally {
      busy = false;
      ctx.requestRefresh();
    }
  };
  const modes = h('div', { class: 'row sv-ap-modes', role: 'group', 'aria-label': 'Режим автопилота сессии' }, SESSION_MODES.map((m) => {
    const node = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'btn', 'aria-pressed': String(view.mode === m.mode) }, [m.label]));
    node.disabled = !view.known;
    node.addEventListener('click', () => {
      if (view.mode !== m.mode) void save({ mode: m.mode });
    });
    return node;
  }));
  const review = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox' }));
  review.checked = view.review;
  review.addEventListener('change', () => void save({ review: review.checked }));
  return h('section', { class: 'sv-run sv-ap', 'aria-label': SESSION_AUTOPILOT_TEXTS.title }, [
    h('div', { class: 'eyebrow' }, [SESSION_AUTOPILOT_TEXTS.title]),
    modes,
    view.reviewShown ? h('label', { class: 'sv-ap-review' }, [review, ` ${SESSION_AUTOPILOT_TEXTS.review}`]) : null,
    view.reviewLine ? h('p', { class: 'sv-muted' }, [view.reviewLine]) : null,
    view.effect ? h('p', { class: 'sv-ap-effect' }, [view.effect]) : null,
    view.note ? h('p', { class: 'sv-warn', role: 'status' }, [view.note]) : null,
    h('p', { class: 'sv-muted' }, [view.known ? SESSION_AUTOPILOT_TEXTS.hint : SESSION_AUTOPILOT_TEXTS.unknown]),
  ].filter((n) => n !== null));
}

/**
 * The line that replaces the mode choice card while a full run prepares the plan.
 * @param {import('./session-view.js').Shell} shell
 * @param {string} text
 * @returns {HTMLElement}
 */
export function autoChoiceLine(shell, text) {
  const { h } = shell.dom;
  return h('div', { class: 'sv-run', role: 'status' }, [
    h('div', { class: 'eyebrow' }, ['Способ выполнения']),
    h('div', { class: 'sv-run-stage' }, [h('span', { class: 'spin' }), h('b', {}, [text])]),
  ]);
}

/**
 * The presses of the project that wait for a busy Kit, or did not go through.
 * @param {import('./session-view.js').Shell} shell
 * @param {Array<{ id: string, tone: 'waiting' | 'warn', text: string }>} waits
 * @returns {HTMLElement}
 */
export function kitWaitsBlock(shell, waits) {
  const { h } = shell.dom;
  return h('div', { class: 'sv-waits', role: 'status' }, waits.map((w) =>
    h('p', { class: w.tone === 'warn' ? 'sv-warn' : 'sv-muted' }, [w.tone === 'waiting' ? h('span', { class: 'spin' }) : null, ` ${w.text}`].filter((n) => n !== null))));
}
