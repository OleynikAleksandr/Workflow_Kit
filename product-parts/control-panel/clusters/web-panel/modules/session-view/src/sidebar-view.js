// @ts-check
import { activityView, choiceView, crossReviewView, foreignPlanView, planQuestionView, planView } from './session-model.js';
import { runView } from './run-model.js';
import { decisionCardsView, decisionFields, hostDecisions } from './decision-model.js';
import { projectReviews as projectReviewsOf } from './plan-cards.js';

/** @typedef {import('../../panel-shell/src/slots.js').SessionContext} SessionContext */
/** @typedef {import('../../panel-shell/src/slots.js').SlotContext} SlotContext */

/**
 * Whether «Ревью плана» shows in the sidebar: a running review and the reviewer's own card always;
 * a finished review of the main session only without a plan card and while its scope is still
 * proposed or active (spec M37 2.4: not after the plan is closed or another one is proposed).
 * @param {{ review: import('./session-model.js').CrossReviewView | null, plan: unknown }} data
 */
export function showsReview(data) {
  const review = data.review;
  if (!review) return false;
  return review.active || review.role === 'reviewer' || (!data.plan && review.current);
}

/** Keep independent cards stable: a timer or plan progress must not rebuild a question/journal.
 * @param {import('./session-view.js').Shell} shell
 * @param {Record<string, (data: any, session: SessionContext, ctx: SlotContext) => HTMLElement>} renderers
 * @param {(session: SessionContext) => number} [version]
 */
export function installSidebarSlot(shell, renderers, version = () => 0) {
  const { h } = shell.dom;
  /** @type {Map<string, { root: HTMLElement, parts: Map<string, { key: string, node: HTMLElement }> }>} */
  const entries = new Map();
  shell.registerSlot('sessionSidebar', {
    select(state, session) {
      const { id } = session.project;
      const { key } = session.session;
      return { version: version(session), activity: activityView(state, id, key), question: planQuestionView(state, id, key), choice: choiceView(state, id, key), plan: planView(state, id, key), foreign: foreignPlanView(state, id, key), review: crossReviewView(state, id, key), run: runView(state, id, key), name: session.session.name , decisions: decisionCardsView(state, id, key, (s, p, k) => projectReviewsOf(s, p).some((r) => r.reviewerKey === k)),
        // M40: the requests of Kit the plan buttons send (`host` projects); empty objects otherwise.
        host: hostDecisions(state, id), requests: Object.fromEntries(['accept', 'close', 'choose', 'confirm-delivery'].map((kind) => [kind, decisionFields(state, id, kind)])) };
    },
    render(data, _state, session, ctx) {
      const id = `${session.project.id}\n${session.session.key}`;
      let entry = entries.get(id);
      if (!entry) {
        entry = { root: h('div', { class: 'sv sv-sidebar' }), parts: new Map() };
        entries.set(id, entry);
      }
      const descriptions = [
        ['question', data.question],
        ['decisions', data.decisions?.length ? data.decisions : null],
        ['review', showsReview(data) ? data.review : null],
        ['delivery', data.plan?.delivery ? { host: data.host, request: data.requests['confirm-delivery'] } : null],
        ['choice', data.choice ? { ...data.choice, request: data.requests.choose } : null],
        ['run', data.run],
        ['plan', data.plan ? { ...data.plan, name: data.name, version: data.version, requests: data.requests } : null],
        ['foreign', data.foreign],
        ['empty', !data.plan && !data.foreign && !data.question && !data.choice && !data.run && !data.decisions?.length && !showsReview(data) ? true : null],
        ['activity', data.activity],
      ];
      const keep = new Set();
      let index = 0;
      for (const [name, value] of descriptions) {
        if (value === null || value === undefined) continue;
        keep.add(name);
        const key = JSON.stringify(value);
        let part = entry.parts.get(name);
        if (part?.key !== key) {
          const renderer = renderers[name];
          if (!renderer) continue;
          const node = renderer(value, session, ctx);
          part?.node.remove();
          part = { key, node };
          entry.parts.set(name, part);
        }
        const before = entry.root.children[index] ?? null;
        if (before !== part.node) entry.root.insertBefore(part.node, before);
        index += 1;
      }
      for (const [name, part] of entry.parts) {
        if (!keep.has(name)) { part.node.remove(); entry.parts.delete(name); }
      }
      entry.root.dataset['needsAttention'] = String(Boolean(data.question || data.choice || data.decisions?.length || data.plan?.delivery || ['ready', 'acceptance', 'accepted', 'blocked'].includes(data.plan?.phase) || ['blocked', 'paused'].includes(data.run?.phase)));
      return entry.root;
    },
  });
}
