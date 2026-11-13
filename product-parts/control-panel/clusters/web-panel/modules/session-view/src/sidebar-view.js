// @ts-check
import { activityView, choiceView, crossReviewView, planQuestionView, planView } from './session-model.js';

/** @typedef {import('../../panel-shell/src/slots.js').SessionContext} SessionContext */
/** @typedef {import('../../panel-shell/src/slots.js').SlotContext} SlotContext */

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
      return { version: version(session), activity: activityView(state, id, key), question: planQuestionView(state, id, key), choice: choiceView(state, id, key), plan: planView(state, id, key), review: crossReviewView(state, id, key), name: session.session.name };
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
        ['review', data.review && (data.review.active || data.review.role === 'reviewer' || !data.plan) ? data.review : null],
        ['delivery', data.plan?.delivery ? true : null],
        ['choice', data.choice],
        ['plan', data.plan ? { ...data.plan, name: data.name, version: data.version } : null],
        ['empty', !data.plan && !data.question && !data.choice && !data.review ? true : null],
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
      entry.root.dataset['needsAttention'] = String(Boolean(data.question || data.choice || data.plan?.delivery || ['ready', 'acceptance', 'accepted', 'blocked'].includes(data.plan?.phase)));
      return entry.root;
    },
  });
}
