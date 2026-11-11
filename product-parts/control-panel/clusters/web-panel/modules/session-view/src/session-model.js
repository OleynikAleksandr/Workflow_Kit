// @ts-check
// Pure models of the session screen (spec sections 6, 8.3, 9.3, 10): the
// path choice card, the plan card with its buttons and «Ревью плана». No DOM; node --test.

export { REASON_LABELS, activityView, timer } from './activity-model.js';

/** Plan card buttons in the order they are drawn. */
export const ACTION_BUTTONS = Object.freeze({
  start: { label: 'Начать выполнение плана', route: 'start', primary: true },
  resume: { label: 'Продолжить', route: 'resume', primary: true },
  pause: { label: 'Пауза', route: 'pause', primary: false },
  accept: { label: 'Принять план', route: 'accept', primary: true },
  'request-fixes': { label: 'Нужны исправления', route: 'fixes', primary: false },
  close: { label: 'Закрыть план', route: 'close', primary: true },
});

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

/**
 * The id part of a session key "<client>:<id>".
 * @param {string} key
 */
export function sessionId(key) {
  return key.slice(key.indexOf(':') + 1);
}

/**
 * The key of the session that holds its Stop for the mode choice in a project, or null.
 * @param {Record<string, unknown>} state
 * @param {string} projectId
 * @returns {string | null}
 */
function choiceHolder(state, projectId) {
  const held = array(record(state['channel'])['sessions']).find((s) => s && s.projectId === projectId && s.holdReason === 'waiting-for-mode-choice');
  return held ? String(held.key) : null;
}

/**
 * @typedef {object} ChoiceView
 * @property {number} generation
 * @property {string} reason
 * @property {Array<{ option: string, title: string, description: string, recommended: boolean }>} options
 * @property {string | null} failedReview why this session's review of the open plan did not run (spec M4 13.2)
 */

/** How long after a Stop the service may still be deciding about the review (spec M4 13.6). */
export const DECIDING_MS = 15_000;

/**
 * A working session with the review on, or without a decision, that has not reviewed the open
 * proposal: its review (or the question about it) comes when its turn ends, so the mode choice
 * is not shown until then (spec M4 sections 11.3 and 12.3; M7 remark 3: no card without buttons).
 * @param {Record<string, unknown>} state
 * @param {string} projectId
 * @returns {boolean}
 */
function reviewComing(state, projectId) {
  const proposal = record(record(record(record(state['workflow'])['projects'])[projectId])['proposal']);
  const scopeId = proposal['scopeId'] ?? null;
  const proposedAt = Date.parse(String(proposal['createdAt'] ?? ''));
  const now = Date.parse(String(state['generatedAt'] ?? '')) || Date.now();
  /**
   * The session works, waits for the review or a question, or has just ended a turn after the
   * proposal and the service is still deciding (spec M4 13.6: no flash of the choice card).
   * @param {Record<string, any>} s
   */
  const pending = (s) => {
    if (s.state === 'working') return true;
    if (s.state === 'holding') return s.holdReason !== 'waiting-for-mode-choice';
    const stoppedAt = Date.parse(String(s.lastStopAt ?? ''));
    return Number.isFinite(stoppedAt) && Number.isFinite(proposedAt) && stoppedAt >= proposedAt && now - stoppedAt < DECIDING_MS;
  };
  const toggles = record(record(record(record(state['review'])['projects'])[projectId])['sessions']);
  const reviews = projectReviews(state, projectId);
  const lists = record(record(record(state['providers'])['projects'])[projectId]);
  // M16 2.1: a session its provider does not list for the project (a stray app thread) is no review source.
  const listed = (/** @type {string} */ key) => { const known = record(lists[key.slice(0, key.indexOf(':'))])['sessions']; return !Array.isArray(known) || known.some((p) => p && (p.localId === sessionId(key) || p.remoteId === sessionId(key))); };
  return array(record(state['channel'])['sessions']).some((s) =>
    s && s.projectId === projectId && pending(s) && toggles[String(s.key)] !== false && listed(String(s.key)) &&
    !reviews.some((r) => r.reviewerKey === s.key) &&
    !reviews.some((r) => r.mainKey === s.key && r.scopeId === scopeId));
}

/**
 * The path choice card for a session: the session holding the choice (or any session of the
 * project when none does); the service lists the options the session's provider can run.
 * @param {Record<string, unknown>} state
 * @param {string} projectId
 * @param {string} key
 * @returns {ChoiceView | null}
 */
export function choiceView(state, projectId, key) {
  const choice = record(record(record(record(state['workflow'])['projects'])[projectId])['choice']);
  if (typeof choice['generation'] !== 'number') return null;
  const holder = choiceHolder(state, projectId);
  if (holder && holder !== key) return null;
  if (projectReviews(state, projectId).some((r) => r.active || r.reviewerKey === key)) return null;
  // M4 12.3: an open plan question comes first.
  if (Object.keys(projectQuestions(state, projectId)).length > 0) return null;
  // M7 remark 3: while a review is ahead the card is hidden, not shown without buttons.
  if (reviewComing(state, projectId)) return null;
  return {
    generation: choice['generation'],
    failedReview: failedReview(state, projectId, key),
    reason: typeof choice['reason'] === 'string' ? choice['reason'] : '',
    options: array(choice['options'])
      .map((o) => ({ option: String(o.option), title: String(o.title), description: String(o.description ?? ''), recommended: Boolean(o.recommended) })),
  };
}

/**
 * @typedef {object} PlanCardView
 * @property {string} scopeId
 * @property {string} phase
 * @property {string} heading
 * @property {number} percent
 * @property {string} progressLabel
 * @property {string | null} blockedReason
 * @property {Array<{ id: string, title: string, state: string, stateLabel: string, modeLabel: string | null, where: string | null, current: boolean }>} tasks
 * @property {Array<{ action: string, label: string, route: string, primary: boolean }>} buttons
 * @property {boolean} delivery the autopilot waits for «Подтвердить выпуск»
 * @property {StartingView | null} starting the press of «Начать выполнение плана» Kit has not seen yet (spec M11)
 */

/**
 * @typedef {object} StartingView
 * @property {'sending' | 'delivered'} step
 * @property {string} stepText
 * @property {string} since the press (ISO)
 * @property {boolean} slow
 * @property {string | null} problem why the start failed: the card offers «Начать заново»
 */

/** Text of the spinner per start step (spec M11 2.4). */
export const START_STEPS = Object.freeze({
  sending: 'команда ждёт отправки агенту',
  delivered: 'агент получил команду и готовится к первой задаче',
});
export const START_SLOW_TEXT = 'агент готовится дольше обычного — это не ошибка, можно подождать';
export const START_AGAIN_LABEL = 'Начать заново';

/**
 * The start of the plan in its ready phase, from the autopilot of the session (spec M11 2.4).
 * @param {Record<string, any> | undefined} pilot
 * @param {string} phase
 * @returns {StartingView | null}
 */
function startingOf(pilot, phase) {
  const start = record(pilot?.start);
  if (phase !== 'ready' || typeof start['at'] !== 'string') return null;
  const step = start['step'] === 'delivered' ? 'delivered' : 'sending';
  const problem = record(start['problem'])['text'];
  return { step, stepText: START_STEPS[step], since: start['at'], slow: Boolean(start['slow']), problem: typeof problem === 'string' && problem ? problem : null };
}

/**
 * The plan card of the session that owns the plan (any session while the plan has no owner).
 * @param {Record<string, unknown>} state
 * @param {string} projectId
 * @param {string} key
 * @returns {PlanCardView | null}
 */
export function planView(state, projectId, key) {
  const plan = record(record(record(record(state['workflow'])['projects'])[projectId])['plan']);
  if (typeof plan['scopeId'] !== 'string') return null;
  const owner = typeof plan['ownerSession'] === 'string' ? plan['ownerSession'] : null;
  if (owner && owner !== sessionId(key)) return null;
  const progress = record(plan['progress']);
  const total = typeof progress['total'] === 'number' ? progress['total'] : 0;
  const done = typeof progress['done'] === 'number' ? progress['done'] : 0;
  const pilot = array(record(state['autopilot'])['sessions']).find((s) => s && s.key === key);
  const delivery = record(pilot?.last)['reason'] === 'delivery-confirmation';
  const actions = array(plan['actions']).map(String);
  const phase = String(plan['phase'] ?? '');
  const starting = startingOf(pilot, phase);
  // M11 2.4: while a start runs the button gives way to the spinner; after a problem it starts anew.
  const shown = starting && !starting.problem ? actions.filter((action) => action !== 'start') : actions;
  return {
    scopeId: plan['scopeId'],
    phase,
    heading: starting && !starting.problem ? 'План запускается' : String(plan['phaseLabel'] ?? ''),
    percent: total > 0 ? Math.round((done / total) * 100) : 0,
    progressLabel: String(plan['progressLabel'] ?? `в main ${done} из ${total}`),
    blockedReason: typeof plan['blockedReason'] === 'string' ? plan['blockedReason'] : null,
    tasks: array(plan['tasks']).map((t) => ({
      id: String(t.id),
      title: String(t.title),
      state: String(t.state),
      stateLabel: String(t.stateLabel ?? ''),
      modeLabel: typeof t.labelText === 'string' ? t.labelText : null,
      where: typeof t.executorWorktree === 'string' ? 'исполнитель · своя рабочая копия' : null,
      current: Boolean(t.current),
    })),
    buttons: Object.entries(ACTION_BUTTONS)
      .filter(([action]) => shown.includes(action))
      .map(([action, b]) => ({ action, label: action === 'start' && starting?.problem ? START_AGAIN_LABEL : b.label, route: b.route, primary: b.primary })),
    delivery,
    starting,
  };
}

/**
 * The reason of a failed review of the open proposal by this session, or null (spec M4 13.2).
 * @param {Record<string, unknown>} state
 * @param {string} projectId
 * @param {string} key
 * @returns {string | null}
 */
function failedReview(state, projectId, key) {
  const scopeId = record(record(record(record(state['workflow'])['projects'])[projectId])['proposal'])['scopeId'] ?? null;
  const latest = projectReviews(state, projectId)
    .filter((r) => r && r.mainKey === key && r.scopeId === scopeId)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
  if (!latest || latest.status !== 'failed') return null;
  return typeof latest.reason === 'string' && latest.reason ? latest.reason : 'причина не записана';
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

/** @param {Record<string, unknown>} state @param {string} projectId @returns {Array<Record<string, any>>} */
function projectReviews(state, projectId) {
  return array(record(record(state['reviews'])['projects'])[projectId]);
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
