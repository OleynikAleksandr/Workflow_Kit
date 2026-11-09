// @ts-check
// The session screen body (activity line, path choice, plan card, delivery confirmation) and
// «Ревью плана» in the sidebar. Panel extension: install(shell) fills the "sessionBody" and
// "sessionReview" slots of panel-shell. Typed text lives in inputs kept per session.
import { activityView, choiceView, crossReviewView, planQuestionView, planView, reviewView, timer } from './session-model.js';

/**
 * Helpers the panel shell gives to extensions (see panel-shell app.js).
 * @typedef {object} Shell
 * @property {typeof import('../../panel-shell/src/slots.js').registerSlot} registerSlot
 * @property {typeof import('../../panel-shell/src/api.js').api} api
 * @property {{ h: typeof import('../../panel-shell/src/dom.js').h }} dom
 */

/** @typedef {import('../../panel-shell/src/slots.js').SlotContext} SlotContext */
/** @typedef {import('../../panel-shell/src/slots.js').SessionContext} SessionContext */

/**
 * @param {Shell} shell
 */
export function install(shell) {
  const { h } = shell.dom;
  /** @type {Map<string, { fixes: HTMLTextAreaElement, delivery: HTMLTextAreaElement, fixesOpen: boolean }>} */
  const inputs = new Map();
  let busy = false;

  /** @param {string} key */
  const inputsOf = (key) => {
    let entry = inputs.get(key);
    if (!entry) {
      const area = (/** @type {string} */ label) => /** @type {HTMLTextAreaElement} */ (h('textarea', { rows: '3', 'aria-label': label, autocapitalize: 'sentences' }));
      entry = { fixes: area('Что исправить'), delivery: area('Подтверждение выпуска'), fixesOpen: false };
      inputs.set(key, entry);
    }
    return entry;
  };

  /**
   * Sends a plan action; errors appear above the screen.
   * @param {SlotContext} ctx
   * @param {string} projectId
   * @param {string} route
   * @param {Record<string, unknown>} body
   * @param {string} failure
   * @param {() => void} [done]
   */
  async function send(ctx, projectId, route, body, failure, done) {
    if (busy) return;
    busy = true;
    try {
      await shell.api('POST', `/api/projects/${encodeURIComponent(projectId)}/workflow/${route}`, body);
      done?.();
    } catch (error) {
      ctx.say('error', failure, error);
    } finally {
      busy = false;
      ctx.requestRefresh();
    }
  }

  /** @param {string} label @param {() => void} action @param {string} [cls] @returns {HTMLButtonElement} */
  const button = (label, action, cls = 'btn') => {
    const node = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: cls }, [label]));
    node.addEventListener('click', action);
    return node;
  };

  /** @param {ReturnType<typeof activityView>} activity */
  function activityBlock(activity) {
    const mark = activity.state === 'working' ? h('span', { class: 'spin' }) : h('span', { class: activity.state === 'holding' ? 'sv-hold' : 'wait' }, [activity.state === 'holding' ? '⏸' : '○']);
    const time = h('span', { 'data-since': activity.since ?? '' }, [timer(activity.since, Date.now())]);
    // A waiting agent gets the queue with its next hook: sessions the service can wake get it by
    // themselves, a chat open in the provider's app only when the user writes there.
    const queued = activity.pending > 0
      ? `сообщений в очереди: ${activity.pending}${activity.state === 'waiting' ? ' — уйдут агенту со следующим сообщением в чате' : ''}`
      : null;
    const details = [time, activity.detail, queued].filter(Boolean);
    const small = h('small', {}, []);
    details.forEach((d, i) => small.append(...(i > 0 ? [' · '] : []), d ?? ''));
    return h('div', {}, [
      h('div', { class: 'eyebrow sv-top' }, [activity.who === 'Оркестратор' ? 'Workflow · оркестратор' : 'Workflow · открыт чат агента']),
      h('div', { class: 'work' }, [mark, h('div', {}, [h('b', {}, [activity.who]), ` ${activity.text}`, small])]),
    ]);
  }

  /**
   * @param {NonNullable<ReturnType<typeof choiceView>>} choice
   * @param {SessionContext} session
   * @param {SlotContext} ctx
   */
  function choiceCard(choice, session, ctx) {
    return h('div', { class: 'choice' }, [
      h('div', { class: 'eyebrow' }, ['Выбор пользователя']),
      h('h2', {}, ['Как составить и выполнить план этой сессии?']),
      choice.reason ? h('p', { class: 'sv-muted' }, [`Почему рекомендует агент: ${choice.reason}`]) : null,
      choice.failedReview
        ? h('div', { class: 'opt sv-review-failed' }, [
            h('b', {}, ['Ревью не запустилось']),
            h('p', {}, [`${choice.failedReview}. Повторите ревью или выберите путь без него.`]),
            button('Повторить ревью', () => void retryReview(session, ctx), 'btn warn'),
          ])
        : null,
      ...choice.options.map((o) =>
        h('div', { class: 'opt' }, [
          h('b', {}, [o.title, o.recommended ? h('span', { class: 'rec' }, [' (рекомендую)']) : null]),
          h('p', {}, [o.description]),
          button('Выбрать', () => void send(ctx, session.project.id, 'choose', { session: session.session.key, generation: choice.generation, option: o.option }, 'Не удалось выбрать путь'), o.recommended ? 'btn warn' : 'btn warn-o'),
        ]),
      ),
      h('p', { class: 'sv-muted sv-gap' }, ['или напишите ответ в чат своими словами']),
    ].filter((n) => n !== null));
  }

  /**
   * «Повторить ревью» of a failed review of the open plan (spec M4 section 13.2).
   * @param {SessionContext} session
   * @param {SlotContext} ctx
   */
  async function retryReview(session, ctx) {
    if (busy) return;
    busy = true;
    try {
      await shell.api('POST', `/api/projects/${encodeURIComponent(session.project.id)}/reviews/${encodeURIComponent(session.session.key)}/retry`, {});
    } catch (error) {
      ctx.say('error', 'Не удалось повторить ревью', error);
    } finally {
      busy = false;
      ctx.requestRefresh();
    }
  }

  /**
   * The plan question of the session (spec M4 section 12): shown first, answered with a button.
   * @param {NonNullable<ReturnType<typeof planQuestionView>>} question
   * @param {SessionContext} session
   * @param {SlotContext} ctx
   */
  function questionCard(question, session, ctx) {
    const answer = async (/** @type {string} */ choice) => {
      if (busy) return;
      busy = true;
      try {
        await shell.api('POST', `/api/projects/${encodeURIComponent(session.project.id)}/sessions/${encodeURIComponent(session.session.key)}/plan-decision`, { choice });
      } catch (error) {
        ctx.say('error', 'Не удалось передать ответ агенту', error);
      } finally {
        busy = false;
        ctx.requestRefresh();
      }
    };
    return h('div', { class: 'choice sv-question' }, [
      h('div', { class: 'eyebrow' }, ['Вопрос агента']),
      h('h2', {}, [question.heading]),
      question.summary ? h('p', {}, [question.summary]) : null,
      ...question.options.map((o) =>
        h('div', { class: 'opt' }, [
          h('b', {}, [o.label]),
          h('p', {}, [o.description]),
          button('Выбрать', () => void answer(o.choice), o.primary ? 'btn warn' : 'btn warn-o'),
        ]),
      ),
      h('p', { class: 'sv-muted sv-gap' }, ['Агент ждёт ответа: ответ уйдёт ему сообщением Workflow Kit.']),
    ].filter((n) => n !== null));
  }

  /**
   * @param {NonNullable<ReturnType<typeof planView>>} plan
   * @param {SessionContext} session
   * @param {SlotContext} ctx
   */
  function planCard(plan, session, ctx) {
    const projectId = session.project.id;
    const key = session.session.key;
    const fields = inputsOf(key);
    const bar = h('i');
    bar.style.width = `${plan.percent}%`;
    const tasks = h('ul', { class: 'tasks' }, plan.tasks.map((t) =>
      h('li', { class: t.current ? 'cur' : '' }, [
        h('span', { class: `ic ${t.state === 'todo' ? '' : t.state}` }),
        h('span', {}, [h('span', { class: 'tid' }, [t.id]), h('b', {}, [t.title])]),
        h('small', {}, [h('span', { class: `st ${t.state}` }, [t.stateLabel]), t.modeLabel ? ` · ${t.modeLabel}` : '', t.where ? ` · ${t.where}` : '']),
      ])));
    const actions = plan.buttons.map((b) => {
      if (b.action === 'request-fixes') {
        return button(b.label, () => {
          fields.fixesOpen = !fields.fixesOpen;
          fixesForm.hidden = !fields.fixesOpen;
          if (fields.fixesOpen) fields.fixes.focus();
        });
      }
      const body = { session: key };
      const run = () => {
        if (b.action === 'accept' && !window.confirm('Принять план? Kit отметит результат как принятый вами.')) return;
        if (b.action === 'close' && !window.confirm('Закрыть план? После этого карточка плана исчезнет.')) return;
        void send(ctx, projectId, b.route, body, `Не удалось: ${b.label}`);
      };
      return button(b.label, run, b.primary ? `btn primary${b.action === 'start' ? ' wide' : ''}` : 'btn');
    });
    const fixesForm = h('div', { class: 'sv-form' }, [
      h('label', {}, ['Что исправить — сообщение уйдёт агенту']),
      fields.fixes,
      button('Отправить агенту', () => {
        const text = fields.fixes.value.trim();
        if (!text) return;
        void send(ctx, projectId, 'fixes', { text, session: key }, 'Не удалось отправить исправления', () => {
          fields.fixes.value = '';
          fields.fixesOpen = false;
        });
      }, 'btn primary'),
    ]);
    fixesForm.hidden = !fields.fixesOpen;
    return h('div', { class: 'plan-card' }, [
      h('div', { class: 'who' }, [session.session.name]),
      h('h2', {}, [plan.heading]),
      h('div', { class: 'bar' }, [bar]),
      h('div', { class: 'count' }, [plan.progressLabel]),
      plan.blockedReason ? h('p', { class: 'sv-warn' }, [plan.blockedReason]) : null,
      tasks,
      h('hr'),
      h('div', { class: 'row' }, actions),
      fixesForm,
    ].filter((n) => n !== null));
  }

  /**
   * @param {SessionContext} session
   * @param {SlotContext} ctx
   */
  function deliveryCard(session, ctx) {
    const fields = inputsOf(session.session.key);
    return h('div', { class: 'choice' }, [
      h('div', { class: 'eyebrow' }, ['Выбор пользователя']),
      h('h2', {}, ['Подтвердить выпуск']),
      h('p', { class: 'sv-muted' }, ['Агент готов собрать и выпустить результат. Напишите своими словами, что подтверждаете: эти слова уйдут агенту.']),
      fields.delivery,
      h('div', { class: 'row' }, [
        button('Подтвердить выпуск', () => {
          const text = fields.delivery.value.trim();
          if (!text) return;
          void send(ctx, session.project.id, 'confirm-delivery', { text, session: session.session.key }, 'Не удалось подтвердить выпуск', () => {
            fields.delivery.value = '';
          });
        }, 'btn warn'),
      ]),
    ]);
  }

  /**
   * «Ревью плана» (spec M4 section 6): the reviewer, the round, who answers, the journal; the
   * reviewer's screen points to the reviewed session.
   * @param {NonNullable<ReturnType<typeof crossReviewView>>} review
   * @param {SessionContext} session
   * @param {SlotContext} ctx
   */
  function crossReviewCard(review, session, ctx) {
    const projectId = session.project.id;
    const open = (/** @type {string} */ key) => (ctx.openSession ? ctx.openSession(projectId, key) : ctx.navigate({ screen: 'session', projectId, key }));
    const other = review.role === 'main' ? review.reviewerKey : review.mainKey;
    const head = review.role === 'main' ? `Ревьюер — ${review.reviewerName}` : `Эта сессия — ревьюер плана сессии «${review.mainTitle}»`;
    const state = review.active
      ? `Круг ${Math.max(review.round, 1)} из ${review.maxRounds} · ${review.turn}`
      : `${review.statusLabel}${review.reason ? `: ${review.reason}` : ''}`;
    const buttons = [
      other && review.canOpenOther ? button(review.role === 'main' ? 'Открыть сессию ревьюера' : 'Открыть основную сессию', () => open(other), 'btn') : null,
      review.active && review.role === 'main'
        ? button('Прервать ревью', async () => {
            try {
              await shell.api('POST', `/api/projects/${encodeURIComponent(projectId)}/reviews/${encodeURIComponent(review.mainKey)}/cancel`);
            } catch (error) {
              ctx.say('error', 'Не удалось прервать ревью', error);
            } finally {
              ctx.requestRefresh();
            }
          }, 'btn')
        : null,
    ].filter((n) => n !== null);
    // The newest entry (the first: newest on top) is open, the rest fold.
    const journal = review.entries.map((entry, index) =>
      h('details', { class: `sv-xr-entry ${entry.from}`, ...(index === 0 ? { open: '' } : {}) }, [h('summary', {}, [`${entry.who}${entry.round ? ` · круг ${entry.round}` : ''}`]), h('p', {}, [entry.text])]),
    );
    const tone = review.status === 'agreed' ? ' ok' : review.active ? '' : ' muted';
    return h('div', { class: `panel sv-xreview${tone}` }, [
      h('h2', {}, ['Ревью плана']),
      h('p', {}, [head]),
      h('p', { class: 'sv-xr-state' }, [state]),
      review.note ? h('p', { class: 'sv-muted' }, [review.note]) : null,
      buttons.length ? h('div', { class: 'sv-xr-buttons' }, buttons) : null,
      journal.length ? h('div', { class: 'sv-xr-journal' }, journal) : null,
    ].filter((n) => n !== null));
  }

  shell.registerSlot('sessionBody', {
    select(state, session) {
      const { id } = session.project;
      const { key } = session.session;
      return { activity: activityView(state, id, key), question: planQuestionView(state, id, key), choice: choiceView(state, id, key), plan: planView(state, id, key), review: crossReviewView(state, id, key), name: session.session.name };
    },
    render(data, _state, session, ctx) {
      const activity = activityBlock(data.activity);
      const cards = [];
      if (data.question) cards.push(questionCard(data.question, session, ctx));
      if (data.review && (data.review.active || data.review.role === 'reviewer' || !data.plan)) cards.push(crossReviewCard(data.review, session, ctx));
      if (data.plan?.delivery) cards.push(deliveryCard(session, ctx));
      if (data.choice) cards.push(choiceCard(data.choice, session, ctx));
      if (data.plan) return h('div', { class: 'sv' }, [...cards, h('div', { class: 'cols' }, [planCard(data.plan, session, ctx), h('div', {}, [activity])])]);
      return h('div', { class: 'sv' }, [h('div', { class: 'sv-activity' }, [activity]), ...cards,
        data.choice || data.review || data.question ? null : h('div', { class: 'panel' }, [h('h2', {}, ['План сессии']), h('p', {}, ['Появится, когда агент предложит план: сначала спецификация, затем выбор пути.'])]),
      ].filter((n) => n !== null));
    },
  });

  // M4 12.3: the review decision is read-only; the answer to the plan question sets it.
  shell.registerSlot('sessionReview', {
    select: (state, session) => reviewView(state, session.project.id, session.session.key),
    render(data) {
      if (!data) return null;
      return h('div', { class: 'review' }, [h('div', { class: 'toggle' }, [`Ревью плана: ${data.on ? 'да' : 'нет'}`]), h('small', {}, [data.hint])]);
    },
  });

  // Timers of the activity line tick between polls.
  setInterval(() => {
    for (const node of Array.from(document.querySelectorAll('[data-since]'))) {
      const since = node.getAttribute('data-since');
      if (since) node.textContent = timer(since, Date.now());
    }
  }, 1000);
}
