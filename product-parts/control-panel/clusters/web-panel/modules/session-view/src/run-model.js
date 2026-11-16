// @ts-check
// Model of the autopiloting run in the session sidebar (spec M39 ui section 2): the mode, the stage
// of the run, what it waits for, why it stopped, «Пауза»/«Продолжить»/«Остановить автопилот» and,
// after the close of the plan, the publication — «Публикует», then the SHA, the upstream and the
// number of commits, or why it did not publish. Only the run's own session shows it. No DOM.

/** @type {Record<string, string>} */
export const MODE_LABELS = Object.freeze({ 'after-start': 'После ручного запуска Плана', full: 'Полный автопилот' });

/** @type {Record<string, string>} */
export const PHASE_LABELS = Object.freeze({
  preparing: 'Готовит спецификацию и план',
  reviewing: 'Ревью спецификации и плана',
  choosing: 'Выбирает способ выполнения',
  starting: 'Запускает план',
  executing: 'Выполняет задачи',
  delivering: 'Выполняет поставку',
  verifying: 'Проверяет результат',
  accepting: 'Автоматическая приёмка',
  closing: 'Закрывает план',
  publishing: 'Публикует',
  completed: 'Опубликовано',
  waiting: 'Ждёт',
  paused: 'На паузе',
  blocked: 'Остановлен: нужно ваше действие',
});

/** Phases in which the run may still act: «Пауза» and «Остановить автопилот». */
const RUNNING = new Set(['preparing', 'reviewing', 'choosing', 'starting', 'executing', 'delivering', 'verifying', 'accepting', 'closing', 'publishing', 'waiting']);

/**
 * @typedef {object} RunView
 * @property {string} runId
 * @property {number} revision
 * @property {string} modeLabel
 * @property {string} phase
 * @property {string} phaseLabel
 * @property {'working' | 'waiting' | 'warn' | 'done'} tone
 * @property {string | null} detail what it waits for, or why it stopped
 * @property {string | null} nextAction
 * @property {Array<{ action: 'pause' | 'resume' | 'stop', label: string, primary: boolean }>} buttons
 * @property {{ text: string, tone: 'working' | 'done' | 'warn' } | null} publication
 */

/** @param {unknown} value @returns {Record<string, any>} */
function record(value) {
  return value && typeof value === 'object' ? /** @type {Record<string, any>} */ (value) : {};
}

/** @param {unknown} sha */
const short = (sha) => (typeof sha === 'string' ? sha.slice(0, 7) : '');

/**
 * @param {Record<string, any>} run
 * @returns {RunView['publication']}
 */
function publicationOf(run) {
  const pub = record(run['publication']);
  const upstream = typeof pub['upstream'] === 'string' ? pub['upstream'] : 'upstream';
  if (run['phase'] === 'completed' && typeof pub['published'] === 'string') {
    const commits = typeof pub['commits'] === 'number' ? pub['commits'] : null;
    const how = pub['already'] ? 'уже был на удалённой ветке, проверен' : commits !== null ? `коммитов: ${commits}` : 'проверен на удалённой ветке';
    return { text: `${short(pub['published'])} → ${upstream} · ${how}`, tone: 'done' };
  }
  const afterClose = run['phase'] === 'publishing' || run['pausedFrom'] === 'publishing';
  if (!afterClose) return null;
  if (run['phase'] === 'blocked') return { text: `Публикация не выполнена: ${run['reason'] ?? 'причина не указана'}`, tone: 'warn' };
  const sha = short(pub['finalSha']);
  return { text: `Публикует${sha ? ` ${sha}` : ''} в ${upstream}${run['phase'] === 'waiting' ? ': ждёт CI этого коммита' : ''}`, tone: 'working' };
}

/**
 * The run of the project whose owner is this session; null for another session, a stopped run and
 * a completed run of an earlier plan.
 * @param {Record<string, unknown>} state
 * @param {string} projectId
 * @param {string} key
 * @returns {RunView | null}
 */
export function runView(state, projectId, key) {
  const run = record(record(record(state['autopiloting'])['projects'])[projectId]);
  if (typeof run['runId'] !== 'string' || run['owner'] !== key) return null;
  const phase = String(run['phase'] ?? '');
  if (phase === 'stopped') return null;
  const plan = record(record(record(record(state['workflow'])['projects'])[projectId])['plan']);
  if (phase === 'completed' && typeof plan['scopeId'] === 'string' && plan['scopeId'] !== run['scopeId']) return null;
  const wait = record(run['wait']);
  const question = wait['reason'] === 'question';
  const expired = phase === 'blocked' && run['reason'] === 'question-expired';
  const phaseLabel = phase === 'waiting' ? (question ? 'Ждёт ответа на вопрос агента' : 'Ждёт CI') : expired ? 'Нужны данные' : (PHASE_LABELS[phase] ?? phase);
  const detail = phase === 'waiting' ? (typeof wait['detail'] === 'string' ? wait['detail'] : null) : phase === 'blocked' || phase === 'paused' ? (typeof run['reason'] === 'string' ? run['reason'] : null) : null;
  /** @type {RunView['buttons']} */
  const buttons = [];
  if (RUNNING.has(phase)) buttons.push({ action: 'pause', label: 'Пауза', primary: false });
  if (phase === 'paused' || phase === 'blocked') buttons.push({ action: 'resume', label: 'Продолжить', primary: true });
  if (phase !== 'completed') buttons.push({ action: 'stop', label: 'Остановить автопилот', primary: false });
  return {
    runId: run['runId'],
    revision: typeof run['revision'] === 'number' ? run['revision'] : 0,
    modeLabel: MODE_LABELS[String(run['mode'])] ?? String(run['mode'] ?? ''),
    phase,
    phaseLabel,
    tone: phase === 'completed' ? 'done' : phase === 'blocked' || phase === 'paused' ? 'warn' : phase === 'waiting' ? 'waiting' : 'working',
    detail,
    nextAction: typeof run['nextAction'] === 'string' && run['nextAction'] ? run['nextAction'] : null,
    buttons,
    publication: publicationOf(run),
  };
}

/** The confirmation of «Остановить автопилот» (M39 ui: the plan stays for manual work). */
export const STOP_CONFIRM = 'Остановить автопилот? Полномочия запуска будут отозваны, новые автоматические действия не начнутся. План останется: его можно вести вручную.';
