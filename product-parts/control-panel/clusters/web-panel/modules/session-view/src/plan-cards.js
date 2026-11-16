// @ts-check
// The path choice card and the plan card of the session sidebar (spec sections 8.3, 9.3; M4;
// M11; M31 3.4: an unstarted plan shows in every main session of the project). No DOM.

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
 * The id part of a session key "<client>:<id>".
 * @param {string} key
 */
export function sessionId(key) {
  return key.slice(key.indexOf(':') + 1);
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
    // M31 3.4: a turn begun after the proposal did not write it and brings no review.
    if (s.state === 'working') return startedBy(s.turnStartedAt, proposedAt);
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
 * The path choice card for a session: every main session of the project (M31 3.4: not only the
 * one holding its Stop for it); the service lists the options the session's provider can run.
 * @param {Record<string, unknown>} state
 * @param {string} projectId
 * @param {string} key
 * @returns {ChoiceView | null}
 */
export function choiceView(state, projectId, key) {
  const choice = record(record(record(record(state['workflow'])['projects'])[projectId])['choice']);
  if (typeof choice['generation'] !== 'number') return null;
  if (archived(state, projectId, key)) return null;
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
 * @property {string[]} dirty paths outside commits that keep the plan from closing (spec M37 2.4)
 * @property {string | null} autopilotingMode the mode of «Автопилотирование» while the plan waits for its start (M39)
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
 * The plan card of the session that owns the plan (any session while the plan has no owner). An
 * unstarted plan (phase ready) shows in every main session (M31 3.4): the press makes it the owner.
 * @param {Record<string, unknown>} state
 * @param {string} projectId
 * @param {string} key
 * @returns {PlanCardView | null}
 */
export function planView(state, projectId, key) {
  const plan = record(record(record(record(state['workflow'])['projects'])[projectId])['plan']);
  if (typeof plan['scopeId'] !== 'string') return null;
  const owner = typeof plan['ownerSession'] === 'string' ? plan['ownerSession'] : null;
  if (owner && owner !== sessionId(key) && (plan['phase'] !== 'ready' || archived(state, projectId, key))) return null;
  if (projectReviews(state, projectId).some((r) => r.reviewerKey === key)) return null;
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
    // M37 2.4: paths outside commits while the plan waits for acceptance or closing.
    dirty: array(plan['dirty']).map(String),
    // M39: the effective policy is shown before the start, for the mode of the settings.
    autopilotingMode: shown.includes('start') ? (record(record(state['autopiloting'])['settings'])['mode'] ?? null) : null,
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

/** @param {Record<string, unknown>} state @param {string} projectId @returns {Array<Record<string, any>>} */
export function projectReviews(state, projectId) {
  return array(record(record(state['reviews'])['projects'])[projectId]);
}

/** @param {Record<string, unknown>} state @param {string} projectId @returns {Record<string, Record<string, any>>} */
function projectQuestions(state, projectId) {
  return /** @type {Record<string, Record<string, any>>} */ (record(record(record(record(state['review'])['projects'])[projectId])['questions']));
}

/**
 * True when the turn began no later than the proposal (it may have written it, M31 3.2); an
 * unknown time counts as the author.
 * @param {unknown} turnStartedAt
 * @param {number} proposedAt
 */
function startedBy(turnStartedAt, proposedAt) {
  const started = Date.parse(String(turnStartedAt ?? ''));
  return !Number.isFinite(started) || !Number.isFinite(proposedAt) || started <= proposedAt;
}

/** @param {Record<string, unknown>} state @param {string} projectId @param {string} key */
function archived(state, projectId, key) {
  return Boolean(record(record(record(record(state['titles'])['projects'])[projectId])[key])['archivedAt']);
}

/**
 * The key and the name of the plan owner from the provider lists of the project, or null.
 * @param {Record<string, unknown>} state
 * @param {string} projectId
 * @param {string} owner the session id of `execution.ownerSession`
 * @returns {{ key: string, name: string } | null}
 */
function ownerSession(state, projectId, owner) {
  for (const [provider, list] of Object.entries(record(record(record(state['providers'])['projects'])[projectId]))) {
    const info = array(record(list)['sessions']).find((s) => s && (s.localId === owner || s.remoteId === owner));
    if (!info) continue;
    const key = `${provider}:${info.localId ?? info.remoteId}`;
    const title = record(record(record(record(state['titles'])['projects'])[projectId])[key]);
    const name = typeof title['name'] === 'string' && title['name'] ? title['name'] : typeof info.title === 'string' && info.title ? info.title : '';
    return { key, name };
  }
  return null;
}

/**
 * @typedef {object} ForeignPlanView
 * @property {string} scopeId
 * @property {string} objective
 * @property {string} progressLabel
 * @property {number} percent
 * @property {string | null} ownerKey the owner session to open, or null when it is not in the lists
 * @property {string} ownerLine «План выполняет сессия «…»» or «План выполняет другая сессия»
 */

/**
 * A started plan seen from a session that does not own it (M31 3.4): what runs and where, with
 * «Открыть сессию»; no plan buttons and no tasks. Null for the owner, a ready plan and archived
 * sessions or reviewers.
 * @param {Record<string, unknown>} state
 * @param {string} projectId
 * @param {string} key
 * @returns {ForeignPlanView | null}
 */
export function foreignPlanView(state, projectId, key) {
  const plan = record(record(record(record(state['workflow'])['projects'])[projectId])['plan']);
  if (typeof plan['scopeId'] !== 'string' || plan['phase'] === 'ready') return null;
  const owner = typeof plan['ownerSession'] === 'string' ? plan['ownerSession'] : null;
  if (!owner || owner === sessionId(key) || archived(state, projectId, key)) return null;
  if (projectReviews(state, projectId).some((r) => r.reviewerKey === key)) return null;
  const found = ownerSession(state, projectId, owner);
  const progress = record(plan['progress']);
  const total = typeof progress['total'] === 'number' ? progress['total'] : 0;
  const done = typeof progress['done'] === 'number' ? progress['done'] : 0;
  return {
    scopeId: plan['scopeId'],
    objective: String(plan['objective'] ?? ''),
    progressLabel: String(plan['progressLabel'] ?? `в main ${done} из ${total}`),
    percent: total > 0 ? Math.round((done / total) * 100) : 0,
    ownerKey: found?.key ?? null,
    ownerLine: found?.name ? `План выполняет сессия «${found.name}»` : 'План выполняет другая сессия',
  };
}
