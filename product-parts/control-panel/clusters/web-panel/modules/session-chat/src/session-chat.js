// @ts-check
// The «Диалог» card of the session screen (spec M18 2.6): the conversation feed of the session and
// a field to write to its agent. Panel extension: install(shell) fills the "sessionChat" slot of
// panel-shell. One element per session lives in a Map and is updated in place by its own polling,
// so the typed text and the scroll position survive polls and leaving the screen.
import { EMPTY_TEXT, LOADING_TEXT, POLL_MS, TRUNCATED_TEXT, canSend, errorText, mergePage, messagesUrl, roleLabel, sendOutcome, sendUrl, timeLabel, unsupportedText } from './chat-model.js';

/**
 * Helpers the panel shell gives to extensions (see panel-shell app.js).
 * @typedef {object} Shell
 * @property {(name: any, definition: import('../../panel-shell/src/slots.js').SessionSlot) => void} registerSlot
 * @property {typeof import('../../panel-shell/src/api.js').api} api
 * @property {{ h: typeof import('../../panel-shell/src/dom.js').h }} dom
 */

/** @typedef {import('../../panel-shell/src/slots.js').SessionContext} SessionContext */
/** @typedef {import('./chat-model.js').ChatMessage} ChatMessage */

/**
 * Chat state of one session.
 * @typedef {object} ChatEntry
 * @property {string} projectId
 * @property {string} key
 * @property {string} provider
 * @property {string} providerLabel
 * @property {HTMLElement} root the card
 * @property {HTMLElement} feed
 * @property {HTMLElement} note truncated or unsupported line
 * @property {HTMLElement} error read error
 * @property {HTMLTextAreaElement} input
 * @property {HTMLButtonElement} button
 * @property {HTMLElement} status outcome of the last send
 * @property {Map<string, HTMLElement>} nodes message nodes by id
 * @property {ChatMessage[] | null} messages null before the first page
 * @property {boolean} inflight a GET is under way
 * @property {boolean} again poll once more when the GET in flight ends
 * @property {boolean} shown the card was visible at the last check
 * @property {number} lastPoll
 * @property {boolean} busy a send is under way
 * @property {number} version grows on every change of the card
 */

/** Distance from the bottom (px) that still counts as "at the bottom". */
const BOTTOM_SLACK = 24;

/** How often visibility of the cards is checked (ms); a poll still runs at most every POLL_MS. */
const CHECK_MS = 1000;

/**
 * @param {Shell} shell
 */
export function install(shell) {
  const { h } = shell.dom;
  /** @type {Map<string, ChatEntry>} */
  const entries = new Map();

  /** @param {string} projectId @param {string} key */
  const idOf = (projectId, key) => `${projectId}\n${key}`;

  /** @param {ChatEntry} entry */
  function refreshButton(entry) {
    entry.button.disabled = !canSend(entry.input.value, entry.busy);
  }

  /**
   * @param {HTMLElement} node
   * @param {string} text
   * @param {string} [tone]
   */
  function line(node, text, tone) {
    node.textContent = text;
    node.hidden = text === '';
    if (tone) node.dataset['tone'] = tone;
  }

  /**
   * @param {ChatEntry} entry
   * @param {ChatMessage} message
   * @returns {HTMLElement}
   */
  function messageNode(entry, message) {
    const who = h('b', {}, [roleLabel(message.role, entry.providerLabel)]);
    const when = h('time', {}, [timeLabel(message.at)]);
    if (message.at) when.setAttribute('datetime', message.at);
    const body = h('div', { class: 'sc-text' });
    body.textContent = message.text;
    return h('div', { class: `sc-msg ${message.role === 'user' ? 'sc-msg-user' : 'sc-msg-agent'}`, 'data-id': message.id }, [
      h('div', { class: 'sc-meta' }, [who, ' ', when]),
      body,
    ]);
  }

  /**
   * Puts a polled page into the card.
   * @param {ChatEntry} entry
   * @param {unknown} answer
   */
  function apply(entry, answer) {
    const page = answer && typeof answer === 'object' ? /** @type {Record<string, unknown>} */ (answer) : {};
    line(entry.error, '');
    if (page['supported'] === false) {
      entry.messages = [];
      entry.nodes.clear();
      entry.feed.replaceChildren();
      entry.feed.hidden = true;
      line(entry.note, unsupportedText(entry.providerLabel), 'muted');
      entry.version += 1;
      return;
    }
    const first = entry.messages === null;
    const feed = entry.feed;
    const atBottom = first || feed.scrollHeight - feed.scrollTop - feed.clientHeight <= BOTTOM_SLACK;
    const merged = mergePage(entry.messages, /** @type {{ messages?: unknown }} */ (page));
    line(entry.note, page['truncated'] === true ? TRUNCATED_TEXT : '', 'muted');
    feed.hidden = false;
    if (!merged.changed) return;
    const previous = new Map((entry.messages ?? []).map((m) => [m.id, m]));
    /** @type {Map<string, HTMLElement>} */
    const nodes = new Map();
    for (const message of merged.messages) {
      const old = previous.get(message.id);
      const kept = entry.nodes.get(message.id);
      nodes.set(message.id, kept && old && old.text === message.text && old.at === message.at ? kept : messageNode(entry, message));
    }
    entry.nodes = nodes;
    entry.messages = merged.messages;
    if (nodes.size === 0) feed.replaceChildren(h('p', { class: 'sc-empty' }, [EMPTY_TEXT]));
    else feed.replaceChildren(...nodes.values());
    if (atBottom && (first || merged.hasNew)) feed.scrollTop = feed.scrollHeight;
    entry.version += 1;
  }

  /**
   * One GET of the session messages; never more than one per session at a time.
   * @param {ChatEntry} entry
   */
  async function poll(entry) {
    if (entry.inflight) {
      entry.again = true;
      return;
    }
    entry.inflight = true;
    entry.lastPoll = Date.now();
    try {
      apply(entry, await shell.api('GET', messagesUrl(entry.projectId, { key: entry.key, provider: entry.provider })));
    } catch (error) {
      // Earlier messages stay; the error shows above the input.
      if (entry.messages === null) entry.feed.replaceChildren();
      line(entry.error, errorText(error), 'error');
      entry.version += 1;
    } finally {
      entry.inflight = false;
      if (entry.again) {
        entry.again = false;
        if (visible(entry)) void poll(entry);
      }
    }
  }

  /** @param {ChatEntry} entry */
  const visible = (entry) => entry.root.isConnected && document.visibilityState === 'visible';

  /**
   * Polls a card that has just become visible or whose interval has passed.
   * @param {ChatEntry} entry
   */
  function check(entry) {
    if (!visible(entry)) {
      entry.shown = false;
      return;
    }
    if (!entry.shown || Date.now() - entry.lastPoll >= POLL_MS) {
      entry.shown = true;
      void poll(entry);
    }
  }

  const checkAll = () => {
    for (const entry of entries.values()) check(entry);
  };

  /** @param {ChatEntry} entry */
  async function send(entry) {
    const text = entry.input.value;
    if (!canSend(text, entry.busy)) return;
    entry.busy = true;
    refreshButton(entry);
    line(entry.status, 'Отправляю…', 'muted');
    try {
      const response = await shell.api('POST', sendUrl(entry.projectId, entry.key), { text });
      if (entry.input.value === text) entry.input.value = '';
      line(entry.status, sendOutcome(response), 'ok');
      void poll(entry);
    } catch (error) {
      // The typed text stays for another try.
      line(entry.status, errorText(error), 'error');
    } finally {
      entry.busy = false;
      refreshButton(entry);
      entry.version += 1;
    }
  }

  /**
   * @param {SessionContext} session
   * @returns {ChatEntry}
   */
  function entryOf(session) {
    const projectId = session.project.id;
    const { key, provider, providerLabel } = session.session;
    const id = idOf(projectId, key);
    const existing = entries.get(id);
    if (existing) {
      existing.providerLabel = providerLabel;
      return existing;
    }
    const feed = h('div', { class: 'sc-feed', role: 'log', 'aria-live': 'polite' }, [h('p', { class: 'sc-empty' }, [LOADING_TEXT])]);
    const note = h('p', { class: 'sc-note' });
    const error = h('p', { class: 'sc-error', role: 'alert' });
    const input = /** @type {HTMLTextAreaElement} */ (h('textarea', { class: 'sc-input', rows: '3', 'aria-label': 'Сообщение агенту', placeholder: 'Сообщение агенту (Ctrl+Enter или ⌘+Enter — отправить)', autocapitalize: 'sentences' }));
    const button = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'btn primary' }, ['Отправить']));
    const status = h('p', { class: 'sc-status', 'aria-live': 'polite' });
    note.hidden = true;
    error.hidden = true;
    status.hidden = true;
    const root = h('div', { class: 'panel sc-card' }, [
      h('h2', {}, ['Диалог']),
      note,
      feed,
      error,
      h('div', { class: 'sc-compose' }, [input, h('div', { class: 'sc-actions' }, [button])]),
      status,
    ]);
    /** @type {ChatEntry} */
    const entry = {
      projectId, key, provider, providerLabel, root, feed, note, error, input, button, status,
      nodes: new Map(), messages: null, inflight: false, again: false, shown: false, lastPoll: 0, busy: false, version: 0,
    };
    input.addEventListener('input', () => refreshButton(entry));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void send(entry);
      }
    });
    button.addEventListener('click', () => void send(entry));
    refreshButton(entry);
    entries.set(id, entry);
    return entry;
  }

  shell.registerSlot('sessionChat', {
    select(_state, session) {
      const entry = entries.get(idOf(session.project.id, session.session.key));
      return { key: session.session.key, label: session.session.providerLabel, version: entry?.version ?? 0 };
    },
    render(_data, _state, session) {
      const entry = entryOf(session);
      // The shell attaches the element after render; poll as soon as it is in the document.
      setTimeout(() => check(entry), 0);
      return entry.root;
    },
  });

  setInterval(checkAll, CHECK_MS);
  document.addEventListener('visibilitychange', checkAll);
}
