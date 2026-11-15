// @ts-check
// The «Диалог» card of the session screen (spec M18 2.6): the conversation feed of the session and
// a field to write to its agent. Panel extension: install(shell) fills the "sessionChat" slot of
// panel-shell. One element per session lives in a Map and is updated in place by its own polling,
// so the typed text and the scroll position survive polls and leaving the screen.
import { EMPTY_TEXT, LOADING_TEXT, POLL_MS, TRUNCATED_TEXT, errorText, mergePage, messagesUrl, roleLabel, syncView, timeLabel, unsupportedText } from './chat-model.js';

import { createComposer } from './composer.js';
import { QUEUED_LABEL, composerData } from './composer-model.js';
import { createQuestionCards } from './question-card.js';
import { WAITING_STATUS, closedPlaces, pendingQuestion, questionsOf } from './question-model.js';

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
 * @property {HTMLElement} state reading state line (M32: loading, a gap)
 * @property {HTMLElement} error read error, or the reconnecting/unavailable line
 * @property {boolean} hadFull a full snapshot was shown: a loading page no longer replaces it
 * @property {ReturnType<typeof createComposer>} composer
 * @property {Map<string, HTMLElement>} nodes message nodes by id
 * @property {ChatMessage[] | null} messages null before the first page
 * @property {import('./composer-model.js').QueuedMessage[]} queued the user's messages waiting for the agent
 * @property {Map<string, HTMLElement>} queuedNodes bubbles of the queued messages by id
 * @property {boolean} inflight a GET is under way
 * @property {boolean} again poll once more when the GET in flight ends
 * @property {boolean} shown the card was visible at the last check
 * @property {number} lastPoll
 * @property {number} version grows on every change of the card
 * @property {import('./question-model.js').Question[] | undefined} questions questions of the agent (M33)
 * @property {ReturnType<typeof createQuestionCards>} cards
 * @property {string | null} link the chat link for this device
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
   * A bubble of the user's message that waits in the channel queue (M28 3.5).
   * @param {ChatEntry} entry
   * @param {import('./composer-model.js').QueuedMessage} message
   * @returns {HTMLElement}
   */
  function queuedNode(entry, message) {
    const body = h('div', { class: 'sc-text' });
    body.textContent = message.text;
    return h('div', { class: 'sc-msg sc-msg-user sc-msg-queued', 'data-queued': message.id }, [
      h('div', { class: 'sc-meta' }, [h('b', {}, [roleLabel('user', entry.providerLabel)]), ' ', h('span', { class: 'sc-queued-label' }, [QUEUED_LABEL])]),
      body,
    ]);
  }

  /**
   * Puts the messages and, after them, the queued bubbles into the feed.
   * @param {ChatEntry} entry
   */
  function layout(entry) {
    // M33 2.5: a closed question after its message, the pending one at the end above the input.
    const places = closedPlaces(entry.questions, new Set(entry.nodes.keys()));
    const pending = pendingQuestion(entry.questions);
    entry.cards.keep(new Set((entry.questions ?? []).map((q) => q.id)));
    const nodes = [
      ...(places.get('') ?? []).map((q) => entry.cards.closed(q)),
      ...[...entry.nodes.entries()].flatMap(([id, node]) => [node, ...(places.get(id) ?? []).map((q) => entry.cards.closed(q))]),
      ...entry.queuedNodes.values(),
      ...(pending ? [entry.cards.pending(pending)] : []),
    ];
    // The focus (and the caret of own text) inside a question card survives the redraw.
    const active = document.activeElement;
    const caret = active instanceof HTMLTextAreaElement ? [active.selectionStart, active.selectionEnd] : null;
    if (nodes.length === 0) entry.feed.replaceChildren(h('p', { class: 'sc-empty' }, [EMPTY_TEXT]));
    else entry.feed.replaceChildren(...nodes);
    if (active instanceof HTMLElement && active !== document.activeElement && entry.feed.contains(active)) {
      active.focus({ preventScroll: true });
      if (caret && active instanceof HTMLTextAreaElement) active.setSelectionRange(caret[0] ?? null, caret[1] ?? null);
    }
  }

  /**
   * Shows the queue of the channel; a bubble goes once its message is given to the agent.
   * @param {ChatEntry} entry
   * @param {import('./composer-model.js').QueuedMessage[]} queued
   */
  function applyQueued(entry, queued) {
    if (JSON.stringify(queued) === JSON.stringify(entry.queued)) return;
    entry.queued = queued;
    /** @type {Map<string, HTMLElement>} */
    const nodes = new Map();
    for (const message of queued) nodes.set(message.id, entry.queuedNodes.get(message.id) ?? queuedNode(entry, message));
    const feed = entry.feed;
    const atBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight <= BOTTOM_SLACK;
    entry.queuedNodes = nodes;
    if (entry.messages === null || feed.hidden) return;
    layout(entry);
    if (atBottom) feed.scrollTop = feed.scrollHeight;
  }

  /**
   * Puts a polled page into the card.
   * @param {ChatEntry} entry
   * @param {unknown} answer
   */
  function apply(entry, answer) {
    const page = answer && typeof answer === 'object' ? /** @type {Record<string, unknown>} */ (answer) : {};
    const view = syncView(page['sync'], entry.hadFull);
    const lines = `${entry.state.textContent}\n${entry.error.textContent}`;
    line(entry.error, view.error, 'error');
    const questions = questionsOf(page);
    const waiting = pendingQuestion(questions) !== null;
    line(entry.state, page['supported'] === false ? '' : view.state || (waiting ? WAITING_STATUS : ''), 'muted');
    if (lines !== `${entry.state.textContent}\n${entry.error.textContent}`) entry.version += 1;
    // A pass in progress never replaces a full snapshot with a part of the history (M32 2.7).
    if (page['supported'] !== false && !view.replace) return;
    if (view.full) entry.hadFull = true;
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
    const questionsChanged = JSON.stringify(questions) !== JSON.stringify(entry.questions);
    entry.questions = questions;
    if (!merged.changed && !questionsChanged) return;
    if (!merged.changed) {
      layout(entry);
      if (atBottom) feed.scrollTop = feed.scrollHeight;
      entry.version += 1;
      return;
    }
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
    layout(entry);
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
      // Earlier messages, the draft, the focus, the scroll and the queued bubbles stay; the error
      // (or the service's reconnecting line) shows above the input; nothing is sent again.
      if (entry.messages === null) entry.feed.replaceChildren();
      line(entry.state, '');
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
    entry.composer.setVisible(visible(entry));
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
      existing.link = session.link;
      return existing;
    }
    const feed = h('div', { class: 'sc-feed', role: 'log', 'aria-live': 'polite' }, [h('p', { class: 'sc-empty' }, [LOADING_TEXT])]);
    const note = h('p', { class: 'sc-note' });
    const state = h('p', { class: 'sc-note sc-state', role: 'status' });
    const error = h('p', { class: 'sc-error', role: 'alert' });
    state.hidden = true;
    const composer = createComposer({ shell, projectId, key, provider, onSent: () => void poll(entry) });
    note.hidden = true;
    error.hidden = true;
    const root = h('div', { class: 'panel sc-card' }, [
      h('h2', {}, ['Диалог']),
      note,
      state,
      feed,
      error,
      composer.node,
    ]);
    const cards = createQuestionCards({
      h, api: shell.api,
      messagesUrl: () => messagesUrl(projectId, { key, provider }),
      link: () => entry.link,
      changed: () => void (entry.version += 1),
      repoll: () => void poll(entry),
    });
    /** @type {ChatEntry} */
    const entry = {
      projectId, key, provider, providerLabel, root, feed, note, state, error, composer, hadFull: false,
      nodes: new Map(), messages: null, queued: [], queuedNodes: new Map(), inflight: false, again: false, shown: false, lastPoll: 0, version: 0,
      questions: undefined, cards, link: session.link,
    };
    entries.set(id, entry);
    return entry;
  }

  shell.registerSlot('sessionChat', {
    select(state, session) {
      const entry = entries.get(idOf(session.project.id, session.session.key));
      return { key: session.session.key, label: session.session.providerLabel, version: entry?.version ?? 0, composer: composerData(state, session.project.id, session.session.key, session.session.provider) };
    },
    render(data, _state, session, ctx) {
      const entry = entryOf(session);
      entry.composer.update(data.composer, ctx.requestRefresh);
      applyQueued(entry, data.composer.queuedMessages);
      // The shell attaches the element after render; poll as soon as it is in the document.
      setTimeout(() => check(entry), 0);
      return entry.root;
    },
  });

  setInterval(checkAll, CHECK_MS);
  document.addEventListener('visibilitychange', checkAll);
}
