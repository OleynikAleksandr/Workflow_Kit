// @ts-check
// Pure models of the session screen (spec sections 6, 8.3, 9.3, 10): the
// path choice card, the plan card with its buttons and «Ревью плана». No DOM; node --test.

export { REASON_LABELS, activityView, timer } from './activity-model.js';
export { ACTION_BUTTONS, DECIDING_MS, START_AGAIN_LABEL, START_SLOW_TEXT, START_STEPS, choiceView, foreignPlanView, planView, sessionId } from './plan-cards.js';
import { projectReviews } from './plan-cards.js';

/**
 * @param {unknown} value
 * @returns {Record<string, any>}
 */
function record(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? /** @type {Record<string, any>} */ (value) : {};
}

/**
 * @param {unknown} list
 * @returns {any[]}
 */
function array(list) {
  return Array.isArray(list) ? list : [];
}

/** @param {Record<string, unknown>} state @param {string} projectId @returns {Record<string, Record<string, any>>} */
function projectQuestions(state, projectId) {
  return /** @type {Record<string, Record<string, any>>} */ (record(record(record(record(state['review'])['projects'])[projectId])['questions']));
}

/**
 * @typedef {object} PlanQuestionView
 * @property {'agent' | 'proposal'} kind
 * @property {string} heading
 * @property {string} summary
 * @property {string | null} askedAt
 * @property {Array<{ choice: 'review' | 'plan' | 'talk', label: string, description: string, primary: boolean }>} options
 */

/**
 * The open plan question of a session (spec M4 section 12): the agent's question before a
 * specification, or the service's question about the review of a proposed plan.
 * @param {Record<string, unknown>} state
 * @param {string} projectId
 * @param {string} key
 * @returns {PlanQuestionView | null}
 */
export function planQuestionView(state, projectId, key) {
  const question = projectQuestions(state, projectId)[key];
  if (!question || typeof question !== 'object') return null;
  const proposal = question['kind'] === 'proposal';
  /** @type {PlanQuestionView['options']} */
  const options = [
    { choice: 'review', label: 'С ревью', description: 'Спецификацию и план проверит сессия другого провайдера, пока они не договорятся.', primary: true },
    { choice: 'plan', label: 'Без ревью', description: proposal ? 'Сразу к выбору способа выполнения.' : 'Спецификация и план без проверки.', primary: false },
  ];
  if (!proposal) options.push({ choice: 'talk', label: 'Просто обсуждаем', description: 'Без спецификации и плана: разговор или исследование.', primary: false });
  return {
    kind: proposal ? 'proposal' : 'agent',
    heading: proposal ? 'План предложен. Проверить его ревьюером?' : 'Агент предлагает спецификацию и план',
    summary: typeof question['summary'] === 'string' ? question['summary'] : '',
    askedAt: typeof question['askedAt'] === 'string' ? question['askedAt'] : null,
    options,
  };
}

/**
 * The review decision of a session, read-only (spec M4 section 12.3: the always-clickable
 * toggle is gone; the answer to the plan question decides): only once decided, until the path
 * is chosen.
 * @param {Record<string, unknown>} state
 * @param {string} projectId
 * @param {string} key
 * @returns {{ on: boolean, hint: string } | null}
 */
export function reviewView(state, projectId, key) {
  const project = record(record(record(state['review'])['projects'])[projectId]);
  const execution = record(record(record(state['workflow'])['projects'])[projectId])['execution'];
  if (project['visible'] === false || (execution && typeof execution === 'object')) return null;
  // M4 section 10: gone while its review runs, for the plan it reviewed and for a reviewer.
  const review = crossReviewView(state, projectId, key);
  const open = record(record(record(record(state['workflow'])['projects'])[projectId])['proposal'])['scopeId'];
  if (review && (review.role === 'reviewer' || review.active || (typeof open === 'string' && review.scopeId === open))) return null;
  const value = record(project['sessions'])[key];
  if (typeof value !== 'boolean') return null;
  return {
    on: value,
    hint: value
      ? 'Решено ответом на вопрос о плане: спецификацию и план проверит ревьюер.'
      : 'Решено ответом на вопрос о плане: без ревью. Агент спросит снова перед следующим планом.',
  };
}


/**
 * Chat links of a reviewer session ("<provider>:<id>"): only when its provider reports an active
 * shared access (spec M12 section 2.3) — then the app can write in the chat while Kit holds the
 * reviewer's turn. Otherwise null: the reviewer's chat is not offered (M4 13.4).
 * @param {Record<string, unknown>} state
 * @param {string} projectId
 * @param {string} reviewerKey
 * @returns {Record<string, string> | null}
 */
export function reviewerChatLinks(state, projectId, reviewerKey) {
  const colon = reviewerKey.indexOf(':');
  if (colon <= 0) return null;
  const provider = reviewerKey.slice(0, colon);
  const id = reviewerKey.slice(colon + 1);
  const summary = array(record(state['providers'])['providers']).find((p) => p && p.id === provider);
  if (record(record(record(summary)['status'])['details'])['sharedAccess']?.state !== 'active') return null;
  const sessions = array(record(record(record(record(state['providers'])['projects'])[projectId])[provider])['sessions']);
  const session = sessions.find((s) => s && (s.localId === id || s.remoteId === id));
  const links = record(session?.links);
  /** @type {Record<string, string>} */
  const usable = {};
  for (const [kind, value] of Object.entries(links)) if (typeof value === 'string' && value !== '') usable[kind] = value;
  return Object.keys(usable).length > 0 ? usable : null;
}

/**
 * @typedef {object} CrossReviewView
 * @property {'main' | 'reviewer'} role the session is the reviewed one or the reviewer
 * @property {boolean} active
 * @property {string | null} note what the user needs to know while the review runs (M4 13.3)
 * @property {boolean} canOpenOther the other session can be opened (only the main one, from the reviewer)
 * @property {string} status
 * @property {string} statusLabel
 * @property {string} turn who answers now ("" when finished)
 * @property {number} round
 * @property {number} maxRounds
 * @property {string} reviewerName provider of the reviewer
 * @property {string | null} reviewerKey
 * @property {Record<string, string> | null} reviewerLinks chat links of the reviewer, only when its
 *   provider shares the chats with its apps (M12: shared access active), else null (M4 13.4)
 * @property {string} mainKey
 * @property {string} mainTitle
 * @property {string | null} scopeId
 * @property {string | null} reason
 * @property {Array<{ from: string, who: string, round: number, text: string, at: string }>} entries newest first
 */

/**
 * The cross review of a session as the main one or the reviewer (spec M4 section 6); the newest.
 * @param {Record<string, unknown>} state
 * @param {string} projectId
 * @param {string} key
 * @returns {CrossReviewView | null}
 */
export function crossReviewView(state, projectId, key) {
  const found = projectReviews(state, projectId)
    .filter((r) => r && (r.mainKey === key || r.reviewerKey === key))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
  if (!found) return null;
  // Names of the providers as the service reports them (the "providers" section).
  const named = (/** @type {unknown} */ id) => {
    const summary = array(record(state['providers'])['providers']).find((p) => p && p.id === id);
    return typeof summary?.label === 'string' && summary.label !== '' ? summary.label : typeof summary?.title === 'string' ? summary.title : null;
  };
  const reviewerName = named(found.reviewerProvider) ?? 'ревьюер';
  const mainName = named(found.mainProvider) ?? 'агент';
  const who = (/** @type {string} */ from) => (from === 'reviewer' ? `Ревьюер (${reviewerName})` : from === 'main' ? `Агент (${mainName})` : 'Workflow Kit');
  const turn = { preparing: `агент (${mainName}) описывает план`, starting: `${reviewerName} запускается`, reviewing: `отвечает ревьюер (${reviewerName})`, answering: `отвечает агент (${mainName})` };
  const role = found.mainKey === key ? 'main' : 'reviewer';
  const active = found.active === true;
  return {
    role,
    active,
    note: active && role === 'main'
      ? 'Ревью идёт само — нажимать ничего не нужно; замечания и ответы — в журнале ниже.'
      : null,
    // M4 13.4: the reviewer's chat is never offered; a reviewer may still open the main session.
    canOpenOther: role === 'reviewer',
    status: String(found.status),
    statusLabel: String(found.statusLabel ?? found.status),
    turn: turn[/** @type {'preparing' | 'starting' | 'reviewing' | 'answering'} */ (found.status)] ?? '',
    round: Number(found.round) || 0,
    maxRounds: Number(found.maxRounds) || 5,
    reviewerName,
    reviewerKey: typeof found.reviewerKey === 'string' ? found.reviewerKey : null,
    reviewerLinks: role === 'main' && typeof found.reviewerKey === 'string' ? reviewerChatLinks(state, projectId, found.reviewerKey) : null,
    mainKey: String(found.mainKey),
    mainTitle: String(found.mainTitle ?? ''),
    scopeId: typeof found.scopeId === 'string' ? found.scopeId : null,
    reason: typeof found.reason === 'string' ? found.reason : null,
    entries: array(found.entries)
      .map((e) => ({ from: String(e.from), who: who(String(e.from)), round: Number(e.round) || 0, text: String(e.text ?? ''), at: String(e.at ?? '') }))
      .reverse(),
  };
}
