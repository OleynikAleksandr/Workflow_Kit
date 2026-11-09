// @ts-check
// Pure models of the project wizard (spec section 7): the preview with its choices and buttons, the
// steps of a run from the "setup" section and where the chat link opens. No DOM; node --test.

/** The two first-session buttons, ChatGPT first as in the mockup. */
export const PROVIDERS = Object.freeze([
  { id: 'codex', label: 'ChatGPT', letter: 'G' },
  { id: 'claude', label: 'Claude', letter: 'C' },
]);

/** Step marks of a run: done, running (spinner), waiting, skipped, failed. */
export const STEP_MARKS = Object.freeze({ done: '✓', running: '', pending: '○', skipped: '–', failed: '✕' });

/**
 * @typedef {object} ChoiceOptionView
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {boolean} checked
 */

/**
 * @typedef {object} ChoiceView
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {boolean} required
 * @property {boolean} answered
 * @property {ChoiceOptionView[]} options
 */

/**
 * @typedef {object} ButtonView
 * @property {string} provider
 * @property {string} label «Создать и открыть в ChatGPT»
 * @property {string} letter
 * @property {boolean} enabled
 * @property {string | null} reason why the button is off
 */

/**
 * @param {unknown} value
 * @returns {Record<string, any>}
 */
function record(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? /** @type {Record<string, any>} */ (value) : {};
}

/**
 * Choices of the preview with the answers marked; an answer that is not an option does not count.
 * @param {Record<string, any>} preview
 * @param {Record<string, string>} answers
 * @returns {ChoiceView[]}
 */
export function choiceViews(preview, answers) {
  const choices = Array.isArray(preview['choices']) ? preview['choices'] : [];
  return choices.map((choice) => {
    const options = (Array.isArray(choice.options) ? choice.options : []).map((/** @type {any} */ option) => ({
      id: String(option.id),
      title: String(option.title ?? option.id),
      description: typeof option.description === 'string' ? option.description : '',
      checked: answers[choice.id] === option.id,
    }));
    return {
      id: String(choice.id),
      title: String(choice.title ?? choice.id),
      description: typeof choice.description === 'string' ? choice.description : '',
      required: Boolean(choice.required),
      answered: options.some((/** @type {ChoiceOptionView} */ o) => o.checked),
      options,
    };
  });
}

/**
 * Answers that belong to the preview's choices (sent with apply).
 * @param {Record<string, any>} preview
 * @param {Record<string, string>} answers
 * @returns {Record<string, string>}
 */
export function validAnswers(preview, answers) {
  /** @type {Record<string, string>} */
  const result = {};
  for (const choice of choiceViews(preview, answers)) {
    const option = choice.options.find((o) => o.checked);
    if (option) result[choice.id] = option.id;
  }
  return result;
}

/**
 * The first-session buttons: off while the preview is blocked, the provider cannot create a
 * session or a required choice has no answer.
 * @param {Record<string, any>} preview
 * @param {Record<string, string>} answers
 * @returns {ButtonView[]}
 */
export function buttonViews(preview, answers) {
  const blocked = record(preview['blocked']);
  const missing = choiceViews(preview, answers).find((c) => c.required && !c.answered);
  const providers = record(preview['providers']);
  return PROVIDERS.map((p) => {
    const info = record(providers[p.id]);
    /** @type {string | null} */
    let reason = null;
    if (typeof blocked['message'] === 'string') reason = blocked['message'];
    else if (info['available'] !== true) reason = typeof info['reason'] === 'string' ? info['reason'] : `${p.label} недоступен`;
    else if (missing) reason = `Сначала выберите ответ: «${missing.title}»`;
    return { provider: p.id, label: `Создать и открыть в ${p.label}`, letter: p.letter, enabled: reason === null, reason };
  });
}

/**
 * @typedef {object} PreviewView
 * @property {string} title «Новый проект» or «Открыть проект»
 * @property {string} lead
 * @property {string} path
 * @property {Array<{ title: string, detail: string }>} actions
 * @property {string} changesLabel «Изменения в папке · N файлов»
 * @property {string[]} files
 * @property {{ message: string, commands: string[] } | null} blocked
 * @property {string[]} notes
 * @property {boolean} expired
 */

/**
 * @param {Record<string, any>} preview
 * @param {number} now
 * @returns {PreviewView}
 */
export function previewView(preview, now) {
  const changes = record(preview['changes']);
  const files = Array.isArray(changes['files']) ? changes['files'].map(String) : [];
  const count = typeof changes['count'] === 'number' ? changes['count'] : files.length;
  const blocked = record(preview['blocked']);
  const expires = Date.parse(String(preview['expiresAt'] ?? ''));
  const open = preview['mode'] === 'open';
  return {
    title: open ? 'Открыть проект' : 'Новый проект',
    lead: open
      ? 'Добавим инструкции, документацию и план в выбранную папку. Существующие файлы сохранятся.'
      : 'Добавим инструкции, документацию и план. Существующие файлы сохранятся.',
    path: String(preview['path'] ?? ''),
    actions: (Array.isArray(preview['actions']) ? preview['actions'] : []).map((a) => ({ title: String(a.title ?? ''), detail: String(a.detail ?? '') })),
    changesLabel: `Изменения в папке · ${filesLabel(count)}`,
    files,
    blocked: typeof blocked['message'] === 'string' ? { message: blocked['message'], commands: Array.isArray(blocked['commands']) ? blocked['commands'].map(String) : [] } : null,
    notes: Array.isArray(preview['notes']) ? preview['notes'].map(String) : [],
    expired: Number.isFinite(expires) && now >= expires,
  };
}

/**
 * Russian plural of "файл".
 * @param {number} n
 * @returns {string}
 */
export function filesLabel(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} файл`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} файла`;
  return `${n} файлов`;
}

/**
 * The run of an operation in the "setup" section, or null.
 * @param {Record<string, unknown>} state
 * @param {string} operationId
 * @returns {Record<string, any> | null}
 */
export function findRun(state, operationId) {
  const runs = record(state['setup'])['runs'];
  return (Array.isArray(runs) ? runs : []).find((r) => r && r.operationId === operationId) ?? null;
}

/**
 * @typedef {object} RunView
 * @property {'running' | 'succeeded' | 'failed' | 'cancelled'} status
 * @property {string} title
 * @property {Array<{ id: string, title: string, status: string, mark: string, note: string | null }>} steps
 * @property {boolean} canCancel
 * @property {{ message: string, hint: string | null } | null} error
 * @property {string | null} sessionKey "<provider>:<localId>" of the created session
 * @property {{ provider: string, localId: string | null, remoteId: string | null } | null} session ids of the created session
 * @property {string | null} projectId
 */

/**
 * @param {Record<string, any>} run
 * @returns {RunView}
 */
export function runView(run) {
  const status = ['running', 'succeeded', 'failed', 'cancelled'].includes(run['status']) ? run['status'] : 'running';
  const session = record(run['session']);
  const id = session['localId'] ?? session['remoteId'];
  const error = record(run['error']);
  const label = PROVIDERS.find((p) => p.id === run['provider'])?.label ?? String(run['provider'] ?? '');
  /** @type {Record<string, string>} */
  const titles = {
    running: run['cancelRequested'] ? 'Останавливаем подготовку' : 'Готовим проект',
    succeeded: `Проект готов, сессия в ${label} создана`,
    failed: 'Подготовка остановилась',
    cancelled: 'Подготовка отменена',
  };
  const errorText = typeof error['message'] === 'string' ? error['message'] : null;
  return {
    status,
    title: titles[status] ?? '',
    steps: (Array.isArray(run['steps']) ? run['steps'] : []).map((step) => ({
      id: String(step.id),
      title: String(step.title ?? step.id),
      status: String(step.status),
      mark: /** @type {Record<string, string>} */ (STEP_MARKS)[step.status] ?? '○',
      // A failed step's note repeats the error shown under the steps.
      note: typeof step.note === 'string' && !(step.status === 'failed' && step.note === errorText) ? step.note : null,
    })),
    canCancel: status === 'running' && !run['cancelRequested'],
    error: typeof error['message'] === 'string' ? { message: error['message'], hint: typeof error['hint'] === 'string' ? error['hint'] : null } : null,
    sessionKey: id && typeof session['provider'] === 'string' ? `${session['provider']}:${id}` : null,
    session: id && typeof session['provider'] === 'string' ? { provider: session['provider'], localId: text(session['localId']), remoteId: text(session['remoteId']) } : null,
    projectId: typeof run['projectId'] === 'string' ? run['projectId'] : null,
  };
}

/** @param {unknown} value @returns {string | null} */
function text(value) {
  return typeof value === 'string' && value !== '' ? value : null;
}

/**
 * Key of the run's session as the providers section lists it ("<provider>:<localId>"), or null
 * while it is not listed. The session is found by its localId or remoteId: a Claude session is
 * created with its Remote Control id and listed under Claude's own id once the SessionStart hook
 * reports it (spec M7, remark 1), so the key of the run alone would never match.
 * @param {Record<string, unknown>} state
 * @param {string} projectId
 * @param {{ provider: string, localId: string | null, remoteId: string | null }} session
 * @returns {string | null}
 */
export function listedSessionKey(state, projectId, session) {
  const projects = record(record(state['providers'])['projects']);
  const ids = [session.localId, session.remoteId].filter((id) => id !== null);
  for (const entry of Object.values(record(projects[projectId]))) {
    for (const listed of Array.isArray(record(entry)['sessions']) ? record(entry)['sessions'] : []) {
      const s = record(listed);
      if (s['provider'] !== session.provider) continue;
      const own = [text(s['localId']), text(s['remoteId'])].filter((id) => id !== null);
      if (!own.some((id) => ids.includes(id))) continue;
      const key = text(s['localId']) ?? text(s['remoteId']);
      return key ? `${session.provider}:${key}` : null;
    }
  }
  return null;
}

/**
 * Where the chat of the new session opens on this device: http(s) links in a new tab, app links
 * (custom schemes) in place, which hands them to the app and keeps the panel.
 * @param {Record<string, unknown>} links
 * @param {number} maxTouchPoints
 * @returns {{ href: string, newTab: boolean } | null}
 */
export function chatTarget(links, maxTouchPoints) {
  const order = maxTouchPoints > 1 ? ['mobile', 'web'] : ['desktop', 'web'];
  for (const kind of order) {
    const value = links[kind];
    if (typeof value !== 'string' || value.trim() === '') continue;
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value.trim())?.[1]?.toLowerCase();
    if (!scheme || ['javascript', 'data', 'file', 'vbscript', 'blob'].includes(scheme)) continue;
    return { href: value.trim(), newTab: scheme === 'http' || scheme === 'https' };
  }
  return null;
}
