// @ts-check
// The autopiloting run card of the session sidebar and the policy line of an unstarted plan
// (spec M39 ui section 2). The buttons act on exactly the run and revision the card shows; a
// changed run answers 409 and the next poll shows the actual one.
import { STOP_CONFIRM } from './run-model.js';

/** @typedef {import('./run-model.js').RunView} RunView */
/** @typedef {import('../../panel-shell/src/slots.js').SlotContext} SlotContext */

/**
 * @param {import('./session-view.js').Shell} shell
 * @param {RunView} run
 * @param {string} projectId
 * @param {SlotContext} ctx
 * @returns {HTMLElement}
 */
export function runCard(shell, run, projectId, ctx) {
  const { h } = shell.dom;
  let busy = false;
  /** @param {'pause' | 'resume' | 'stop'} action */
  const press = async (action) => {
    if (busy) return;
    if (action === 'stop' && !window.confirm(STOP_CONFIRM)) return;
    busy = true;
    try {
      await shell.api('POST', `/api/projects/${encodeURIComponent(projectId)}/autopiloting/${action}`, { runId: run.runId, expectedRevision: run.revision });
    } catch (error) {
      ctx.say('error', 'Автопилот не принял команду', error);
    } finally {
      busy = false;
      ctx.requestRefresh();
    }
  };
  const mark = run.tone === 'working' ? h('span', { class: 'spin' }) : h('span', { class: run.tone === 'done' ? 'sv-done' : 'sv-hold' }, [run.tone === 'done' ? '✓' : run.tone === 'waiting' ? '○' : '⏸']);
  return h('div', { class: `sv-run sv-run-${run.tone}`, role: 'status' }, [
    h('div', { class: 'eyebrow' }, [`Автопилот · ${run.modeLabel}`]),
    h('div', { class: 'sv-run-stage' }, [mark, h('b', {}, [run.phaseLabel])]),
    run.detail ? h('p', { class: run.tone === 'warn' ? 'sv-warn' : 'sv-muted' }, [run.detail]) : null,
    run.nextAction ? h('p', { class: 'sv-muted' }, [run.nextAction]) : null,
    // M41: a warning only; the run goes on.
    run.notice ? h('p', { class: 'sv-warn' }, [run.notice]) : null,
    // Green only for a verified publication; a publication under way is plain text.
    run.publication ? h('p', { class: { warn: 'sv-warn', done: 'sv-run-pub', working: 'sv-muted' }[run.publication.tone] }, [run.publication.text]) : null,
    run.buttons.length
      ? h('div', { class: 'row' }, run.buttons.map((b) => {
          const node = h('button', { type: 'button', class: b.primary ? 'btn primary' : 'btn' }, [b.label]);
          node.addEventListener('click', () => void press(b.action));
          return node;
        }))
      : null,
  ].filter((n) => n !== null));
}

/** @type {Map<string, { text: string } | 'loading' | 'failed'>} */
const policies = new Map();

/**
 * The effective policy of a start before the press (legacy plan, manual acceptance, Kit update):
 * asked once per plan and mode; the card is drawn again when it arrives.
 * @param {import('./session-view.js').Shell} shell
 * @param {string} projectId
 * @param {{ scopeId: string, autopilotingMode: string | null }} plan
 * @param {() => void} redraw
 * @returns {HTMLElement | null}
 */
export function policyLine(shell, projectId, plan, redraw) {
  if (!plan.autopilotingMode || plan.autopilotingMode === 'off') return null;
  const key = `${projectId}\n${plan.scopeId}\n${plan.autopilotingMode}`;
  const known = policies.get(key);
  if (!known) {
    policies.set(key, 'loading');
    shell
      .api('GET', `/api/projects/${encodeURIComponent(projectId)}/autopiloting/policy`)
      .then((answer) => policies.set(key, { text: typeof answer?.text === 'string' ? answer.text : '' }))
      .catch(() => policies.set(key, 'failed'))
      .finally(redraw);
  }
  const text = known && typeof known === 'object' ? known.text : known === 'failed' ? 'Не удалось узнать, как пройдёт автопилот: смотрите карточку после старта.' : 'Проверяю, как пройдёт автопилот…';
  return shell.dom.h('p', { class: 'sv-muted sv-policy' }, [`Автопилот после старта: ${text}`]);
}
