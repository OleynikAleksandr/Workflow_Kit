// @ts-check
import { localIdOf, sendUrl } from './chat-model.js';

/** @param {unknown} value @returns {Record<string, any>} */
const object = (value) => value && typeof value === 'object' ? value : {};
/** @typedef {{ available: boolean, reason: string, turnRef: string | null, state: string, pending: boolean }} Turn */
/** @typedef {{ id: string, text: string, at: string }} QueuedMessage */
/** @typedef {{ turn: Turn, model: string, queued: number, queuedMessages: QueuedMessage[] }} ComposerData */

/** The panel shows at most this many queued messages (agent-channel QUEUED_VIEW_MAX). */
export const QUEUED_MAX = 20;
/** Label of a queued bubble in the feed (M28 3.5). */
export const QUEUED_LABEL = 'в очереди';

/** The user's queued panel messages of the activity; anything malformed is skipped.
 * @param {unknown} list @returns {QueuedMessage[]} */
export function queuedMessages(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((m) => m && typeof m.id === 'string' && typeof m.text === 'string' && m.text.trim())
    .slice(0, QUEUED_MAX).map((m) => ({ id: m.id, text: m.text, at: typeof m.at === 'string' ? m.at : '' }));
}

/** Only public state; a provider title is never a model name.
 * @param {Record<string, unknown>} state @param {string} projectId
 * @param {string} key @param {string} provider @returns {ComposerData}
 */
export function composerData(state, projectId, key, provider) {
  const channel = object(state['channel']);
  const raw = object(object(object(channel['interruptions'])[projectId])[key]);
  const sessions = channel['sessions'];
  const activity = Array.isArray(sessions) ? sessions.find((s) => s.projectId === projectId && s.key === key) : null;
  const phase = raw['state'] ?? activity?.state;
  const turn = {
    available: raw['available'] === true,
    reason: typeof raw['reason'] === 'string' ? raw['reason'] : 'Состояние текущего хода ещё не подтверждено',
    turnRef: typeof raw['turnRef'] === 'string' ? raw['turnRef'] : null,
    state: ['working', 'holding', 'waiting'].includes(phase) ? phase : 'unknown',
    pending: raw['pending'] === true,
  };
  const providers = object(object(object(state['providers'])['projects'])[projectId]);
  const list = object(providers[provider])['sessions'];
  const info = Array.isArray(list) ? list.find((s) => s.localId === localIdOf(key)) : null;
  const queued = typeof activity?.pending === 'number' && Number.isFinite(activity.pending) ? activity.pending : 0;
  return { turn, model: typeof info?.model === 'string' && info.model.trim() ? info.model : '—', queued, queuedMessages: queuedMessages(activity?.queued) };
}

/** How long a message queued for a waiting agent may stay undelivered before the panel says so (M28). */
export const DELIVERY_CONFIRM_MS = 10_000;
export const NOT_DELIVERED_TEXT = 'Сообщение не дошло до Claude. Отправьте ещё раз';
/** A message queued while the agent waits must start a turn; still waiting with a queue means it did not.
 * @param {ComposerData} data */
export const undelivered = (data) => data.turn.state === 'waiting' && data.queued > 0;
/** @param {string} projectId @param {string} key */
export const interruptUrl = (projectId, key) => sendUrl(projectId, key).replace(/\/message$/, '/interrupt');

/** A confirmed result only overrides the generation it actually stopped.
 * @param {Turn} turn @param {string | null} confirmedRef
 */
export function effectiveTurn(turn, confirmedRef) {
  return confirmedRef && turn.turnRef === confirmedRef ? { ...turn, state: 'waiting', pending: false } : turn;
}

/** @param {unknown} error */
export const isStaleTurn = (error) => object(error)['code'] === 'stale-turn';

/** An edit followed by restoring the same text is still a newer draft.
 * @param {number} sentRevision @param {number} currentRevision @param {string} sent @param {string} current
 */
export const mayClearDraft = (sentRevision, currentRevision, sent, current) => sentRevision === currentRevision && sent === current;

/** Keyboard state is independent of HTTP and DOM. Safari's trailing Enter is consumed once;
 * keyup or a subsequent key closes the guard, so the next deliberate Enter still works.
 */
export function createInputKeys() {
  let composing = false;
  let endedAt = -Infinity;
  return {
    start() { composing = true; endedAt = -Infinity; },
    /** @param {number} at */
    end(at) { composing = false; endedAt = at; },
    /** @param {string} key */
    up(key) { if (key === 'Enter') endedAt = -Infinity; },
    /** @param {{ key: string, timeStamp: number, isComposing?: boolean, keyCode?: number, shiftKey?: boolean, ctrlKey?: boolean, metaKey?: boolean, repeat?: boolean }} event
     * @param {boolean} working @returns {'native' | 'ignore' | 'send'}
     */
    down(event, working) {
      if (composing || event.isComposing || event.keyCode === 229) return 'native';
      const trailing = event.key === 'Enter' && event.timeStamp - endedAt >= 0 && event.timeStamp - endedAt < 40;
      endedAt = -Infinity;
      if (trailing || (event.key === 'Enter' && event.repeat)) return 'ignore';
      if (event.key !== 'Enter' || event.shiftKey) return 'native';
      if (event.ctrlKey || event.metaKey || !working) return 'send';
      return 'native';
    },
  };
}
