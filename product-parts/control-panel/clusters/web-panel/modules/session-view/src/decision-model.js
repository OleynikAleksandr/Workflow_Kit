// @ts-check
// Decision cards of Kit requests (spec M40 2.2): `unblock`, `approve-install` and
// `adopt-commits` are built from the pending requests in the panel state (`workflow.projects[id]
// .decisions`) and show exactly what the user allows. A button returns the request id and digest
// the user saw: data changed after the card was shown is refused (`DECISION_STALE`). The existing
// buttons of acceptance, closing, the mode choice and the delivery confirmation send the request of
// their kind as well. No DOM.

/**
 * @param {unknown} value
 * @returns {Record<string, any>}
 */
function record(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? /** @type {Record<string, any>} */ (value) : {};
}

/** @param {unknown} list @returns {any[]} */
const array = (list) => (Array.isArray(list) ? list : []);

/** Kinds with a card of their own; the other kinds use the existing plan cards. */
export const DECISION_CARD_KINDS = Object.freeze(['unblock', 'approve-install', 'adopt-commits']);

export const DECISION_CARD_TEXTS = Object.freeze({
  unblock: { title: 'План заблокирован', lead: 'Агент остановил задачу по причине:', button: 'Снять блокировку', noReason: 'Причина не указана.' },
  'approve-install': { title: 'Установка инструментов', lead: 'Kit установит проверки качества этими командами:', button: 'Разрешить установку', noReason: 'Команд установки нет.' },
  'adopt-commits': { title: 'Коммиты в обход Kit', lead: 'Эти коммиты сделаны без Workflow Kit; работа продолжится, когда вы их примете:', button: 'Принять коммиты', noReason: 'Список коммитов пуст.' },
});

/**
 * @typedef {object} DecisionCardView
 * @property {string} kind
 * @property {string} id
 * @property {string} inputDigest
 * @property {string} title
 * @property {string} lead
 * @property {string[]} items what exactly the user allows (the reason, the commands, the commits)
 * @property {boolean} code the items are commands or SHAs (monospace)
 * @property {string} button
 * @property {string | null} taskId
 */

/**
 * The project's workflow entry of the panel state.
 * @param {Record<string, unknown>} state
 * @param {string} projectId
 */
function project(state, projectId) {
  return record(record(record(state['workflow'])['projects'])[projectId]);
}

/**
 * The pending requests of the project in a `host` project (Kit 2.4.0+); none otherwise.
 * @param {Record<string, unknown>} state
 * @param {string} projectId
 * @returns {Record<string, any>[]}
 */
export function pendingDecisions(state, projectId) {
  const entry = project(state, projectId);
  if (entry['decisionsMode'] !== 'host') return [];
  return array(entry['decisions']).map(record).filter((d) => d['state'] === 'pending' && typeof d['id'] === 'string' && typeof d['inputDigest'] === 'string');
}

/**
 * What a plan button of `kind` sends besides its own fields: the request the user sees, or nothing.
 * @param {Record<string, unknown>} state
 * @param {string} projectId
 * @param {string} kind
 * @param {string | null} [taskId]
 * @returns {{ decision: { id: string, inputDigest: string }, requestId: string } | {}}
 */
export function decisionFields(state, projectId, kind, taskId = null) {
  const found = pendingDecisions(state, projectId).find((d) => d['kind'] === kind && (taskId === null || d['taskId'] === taskId));
  return found ? { decision: { id: found['id'], inputDigest: found['inputDigest'] }, requestId: `card:${found['id']}` } : {};
}

/** @param {Record<string, any>} command */
function commandLine(command) {
  return [String(command['executable'] ?? ''), ...array(command['args']).map(String)].filter((part) => part !== '').join(' ');
}

/**
 * @param {Record<string, any>} decision
 * @param {Record<string, any>} plan
 * @returns {{ items: string[], code: boolean }}
 */
function itemsOf(decision, plan) {
  const params = record(decision['params']);
  if (decision['kind'] === 'unblock') {
    const reason = typeof plan['blockedReason'] === 'string' && plan['blockedReason'].trim() !== '' ? plan['blockedReason'].trim() : null;
    return { items: reason ? [reason] : [], code: false };
  }
  if (decision['kind'] === 'approve-install') return { items: array(params['install']).map(record).map(commandLine).filter((line) => line !== ''), code: true };
  return { items: array(params['commits']).map(String), code: true };
}

/**
 * The decision cards of a session: the session that owns the plan, or any session while the plan
 * has no owner. A reviewer session gets none.
 * @param {Record<string, unknown>} state
 * @param {string} projectId
 * @param {string} key
 * @param {(state: Record<string, unknown>, projectId: string, key: string) => boolean} [isReviewer]
 * @returns {DecisionCardView[]}
 */
export function decisionCardsView(state, projectId, key, isReviewer = () => false) {
  const pending = pendingDecisions(state, projectId).filter((d) => DECISION_CARD_KINDS.includes(String(d['kind'])));
  if (pending.length === 0 || isReviewer(state, projectId, key)) return [];
  const plan = record(project(state, projectId)['plan']);
  const owner = typeof plan['ownerSession'] === 'string' ? plan['ownerSession'] : null;
  if (owner && owner !== key.slice(key.indexOf(':') + 1)) return [];
  return pending.map((decision) => {
    const kind = /** @type {keyof typeof DECISION_CARD_TEXTS} */ (decision['kind']);
    const texts = DECISION_CARD_TEXTS[kind];
    const { items, code } = itemsOf(decision, plan);
    return {
      kind,
      id: decision['id'],
      inputDigest: decision['inputDigest'],
      title: texts.title,
      lead: items.length > 0 ? texts.lead : texts.noReason,
      items,
      code,
      button: texts.button,
      taskId: typeof decision['taskId'] === 'string' ? decision['taskId'] : null,
    };
  });
}

/**
 * The body of POST /api/projects/:id/workflow/decision for the button of a card.
 * @param {DecisionCardView} card
 * @param {string} key
 */
export function decisionBody(card, key) {
  return { kind: card.kind, decision: { id: card.id, inputDigest: card.inputDigest }, requestId: `card:${card.id}`, session: key };
}

/**
 * A `host` project: the delivery is confirmed by the button alone, no words to the agent.
 * @param {Record<string, unknown>} state
 * @param {string} projectId
 */
export function hostDecisions(state, projectId) {
  return project(state, projectId)['decisionsMode'] === 'host';
}
