// @ts-check
// The card of an agent's question in the dialogue (spec M33 section 2.5): options as radios or
// checkboxes, «Свой вариант» with a text field, several parts in one card, «Отправить» and
// Ctrl/⌘+Enter. One click on an option never sends. The choice and the attempt live here per
// question, so they survive polls; the DOM of a card is built once and updated in place. A question
// answered by a message (spec M33 section 2.7) sends its text through the message route of the panel.
import {
  OPEN_APP_TEXT, OTHER_LABEL, OTHER_PLACEHOLDER, RETRY_MS, SEND_LABEL, SEND_TRIES,
  afterError, answerOf, answerUrl, byMessage, cardView, closedView, emptyChoice, messageText, newAttemptId, pick, toggleOther, writeOther,
} from './question-model.js';

/** @typedef {import('./question-model.js').Question} Question */
/** @typedef {import('./question-model.js').Choice} Choice */
/** @typedef {import('./question-model.js').Attempt} Attempt */

/** How long one POST of an answer may take (the route waits up to 10 s for the outcome). */
const ANSWER_TIMEOUT_MS = 20_000;

/**
 * @typedef {object} CardsDeps
 * @property {typeof import('../../panel-shell/src/dom.js').h} h
 * @property {typeof import('../../panel-shell/src/api.js').api} api
 * @property {() => string} messagesUrl the URL of the session's messages
 * @property {() => string} sendUrl the URL of sending a message to the agent (as the input field does)
 * @property {() => void} sent a message answer went out: refresh the queue and the feed
 * @property {() => string | null} link the chat link for this device
 * @property {() => void} changed the card changed (the dialogue redraws its version)
 * @property {() => void} repoll poll the feed now
 * @property {(ms: number) => Promise<void>} [sleep]
 */

/** @param {CardsDeps} deps */
export function createQuestionCards(deps) {
  const { h } = deps;
  const sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  /** @type {Map<string, { question: Question, shape: string, choice: Choice, attempt: Attempt, node: HTMLElement, sync: () => void }>} */
  const cards = new Map();
  /** @type {Map<string, HTMLElement>} */
  const closed = new Map();

  function openApp() {
    const link = deps.link();
    if (!link) return;
    if ((navigator.maxTouchPoints ?? 0) > 1) window.location.assign(link);
    else void deps.api('POST', '/api/open-link', { url: link }).catch(() => window.location.assign(link));
  }

  /** @param {string} id */
  async function send(id) {
    const card = cards.get(id);
    if (!card) return;
    const answers = answerOf(card.question, card.choice);
    if (!answers || card.attempt.phase === 'sending' || card.attempt.phase === 'waiting') return;
    if (byMessage(card.question)) {
      // An ordinary message, as from the input field: no attempt rules and no automatic repeat.
      card.attempt = { phase: 'sending', attemptId: '' };
      card.sync();
      try {
        await deps.api('POST', deps.sendUrl(), { text: messageText(card.question, answers) });
        card.attempt = { phase: 'messaged' };
        deps.sent();
      } catch (error) {
        const message = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && error.message ? error.message : 'Ответ не отправлен';
        card.attempt = { phase: 'refused', text: message };
      }
      card.sync();
      return;
    }
    const attemptId = newAttemptId();
    card.attempt = { phase: 'sending', attemptId };
    card.sync();
    for (let tries = 1; ; tries += 1) {
      try {
        const reply = /** @type {{ outcome?: 'accepted' | 'unknown' }} */ (await deps.api('POST', answerUrl(deps.messagesUrl(), id), { attemptId, answers }, ANSWER_TIMEOUT_MS));
        card.attempt = { phase: 'done', outcome: reply?.outcome === 'accepted' ? 'accepted' : 'unknown' };
        break;
      } catch (error) {
        const next = afterError(error, attemptId);
        // A network error: the same attemptId again, nothing new is handed out (spec 2.1).
        if (next.retry && tries < SEND_TRIES) {
          await sleep(RETRY_MS);
          continue;
        }
        card.attempt = next.retry ? { phase: 'waiting', attemptId } : next.attempt;
        if (next.repoll || next.retry) deps.repoll();
        break;
      }
    }
    card.sync();
    deps.repoll();
  }

  /** @param {Question} question */
  function build(question) {
    const id = question.id;
    /** @type {Array<{ part: import('./question-model.js').QuestionPart, inputs: HTMLInputElement[], other: HTMLInputElement | null, text: HTMLTextAreaElement | null }>} */
    const rows = [];
    const parts = question.parts.map((part, index) => {
      const name = `sc-q-${id}-${index}`;
      const type = part.multiSelect ? 'checkbox' : 'radio';
      const inputs = part.options.map((option) => /** @type {HTMLInputElement} */ (h('input', { type, name, value: option.label })));
      const options = part.options.map((option, i) => {
        const label = h('span', { class: 'sc-q-label' }, [h('b', {}, [option.label]), ...(option.description ? [h('small', {}, [option.description])] : [])]);
        return h('label', { class: 'sc-q-option' }, [inputs[i], label]);
      });
      let other = null;
      let text = null;
      if (part.allowOther) {
        other = /** @type {HTMLInputElement} */ (h('input', { type, name, value: '', class: 'sc-q-other-toggle' }));
        text = /** @type {HTMLTextAreaElement} */ (h('textarea', { class: 'sc-q-other-text', rows: '1', placeholder: OTHER_PLACEHOLDER, 'aria-label': OTHER_LABEL }));
        options.push(h('label', { class: 'sc-q-option sc-q-other' }, [other, h('span', { class: 'sc-q-label' }, [h('b', {}, [OTHER_LABEL])])]));
        options.push(text);
      }
      rows.push({ part, inputs, other, text });
      const legend = h('legend', {}, [...(part.header ? [h('span', { class: 'sc-q-header' }, [part.header])] : []), h('span', { class: 'sc-q-question' }, [part.question])]);
      return h('fieldset', { class: 'sc-q-part' }, [legend, ...options]);
    });
    const status = h('p', { class: 'sc-q-status', role: 'status', 'aria-live': 'polite' });
    const button = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'sc-q-send' }, [SEND_LABEL]));
    const open = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'sc-q-open' }, [OPEN_APP_TEXT]));
    const node = h('section', { class: 'sc-question', 'data-question': id, role: 'group', 'aria-label': 'Вопрос агента' }, [...parts, h('div', { class: 'sc-q-foot' }, [status, open, button])]);
    const sync = () => {
      const card = cards.get(id);
      if (!card) return;
      const view = cardView(card.question, card.choice, card.attempt);
      for (const row of rows) {
        const c = card.choice[row.part.id];
        row.inputs.forEach((input) => { input.checked = c?.selected.includes(input.value) === true; input.disabled = !view.choosable; });
        if (row.other && row.text) {
          row.other.checked = c?.otherOn === true;
          row.other.disabled = !view.choosable;
          row.text.disabled = !view.choosable;
          row.text.hidden = !(c?.otherOn === true);
          if (row.text.value !== (c?.other ?? '')) row.text.value = c?.other ?? '';
        }
      }
      status.textContent = view.text;
      status.hidden = view.text === '';
      status.dataset['tone'] = view.tone;
      button.hidden = !view.button;
      button.disabled = !view.active;
      open.hidden = !view.openApp || !deps.link();
      node.dataset['answerable'] = String(card.question.answerable);
      deps.changed();
    };
    for (const row of rows) {
      row.inputs.forEach((input) => input.addEventListener('change', () => {
        const card = cards.get(id);
        if (!card) return;
        card.choice = pick(card.choice, row.part, input.value);
        if (card.attempt.phase === 'refused') card.attempt = { phase: 'idle' };
        sync();
      }));
      row.other?.addEventListener('change', () => {
        const card = cards.get(id);
        if (!card) return;
        card.choice = toggleOther(card.choice, row.part, row.part.multiSelect ? /** @type {HTMLInputElement} */ (row.other).checked : true);
        sync();
        if (card.choice[row.part.id]?.otherOn) row.text?.focus();
      });
      row.text?.addEventListener('input', () => {
        const card = cards.get(id);
        if (!card || !row.text) return;
        card.choice = writeOther(card.choice, row.part, row.text.value);
        if (card.attempt.phase === 'refused') card.attempt = { phase: 'idle' };
        sync();
      });
    }
    button.addEventListener('click', () => void send(id));
    open.addEventListener('click', openApp);
    node.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void send(id);
      }
    });
    return { node, sync };
  }

  return {
    /**
     * The node of a pending question; the choice and the attempt survive polls.
     * @param {Question} question
     * @returns {HTMLElement}
     */
    pending(question) {
      const shape = JSON.stringify(question.parts);
      let card = cards.get(question.id);
      if (!card || card.shape !== shape) {
        const built = build(question);
        card = { question, shape, choice: card?.choice ?? emptyChoice(question), attempt: card?.attempt ?? { phase: 'idle' }, node: built.node, sync: built.sync };
        cards.set(question.id, card);
      }
      card.question = question;
      // Delivered (by this card or before a restart): no button; the outcome comes by polling.
      if (question.delivery === 'sent' && card.attempt.phase !== 'sending') card.attempt = { phase: 'waiting', attemptId: card.attempt.phase === 'waiting' ? card.attempt.attemptId : '' };
      card.sync();
      return card.node;
    },
    /**
     * The compact node of a closed question: the question and the proven answer, or what is known.
     * @param {Question} question
     * @returns {HTMLElement}
     */
    closed(question) {
      const card = cards.get(question.id);
      const view = closedView(question, card?.attempt);
      const shape = JSON.stringify([question.state, question.parts, view]);
      const known = closed.get(question.id);
      if (known && known.dataset['shape'] === shape) return known;
      const lines = question.parts.map((part) => {
        const answer = view.answers.find((a) => a.header === (part.header || part.question));
        return h('div', { class: 'sc-q-closed-part' }, [h('span', { class: 'sc-q-question' }, [part.question]), ...(answer ? [h('b', { class: 'sc-q-answer' }, [answer.text])] : [])]);
      });
      const node = h('section', { class: 'sc-question sc-question-closed', 'data-question': question.id, 'data-state': question.state, 'data-shape': shape }, [
        ...lines, ...(view.note ? [h('p', { class: 'sc-q-note' }, [view.note])] : []),
      ]);
      closed.set(question.id, node);
      return node;
    },
    /** Forgets cards of questions no longer on the page. @param {ReadonlySet<string>} ids */
    keep(ids) {
      for (const id of [...cards.keys()]) if (!ids.has(id)) cards.delete(id);
      for (const id of [...closed.keys()]) if (!ids.has(id)) closed.delete(id);
    },
  };
}
