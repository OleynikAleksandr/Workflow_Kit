// @ts-check
// The project wizard (spec section 7): name or folder → preview with one consent → preparation
// steps with «Отменить подготовку» → the chat of the first session opens by itself. Panel extension:
// install(shell) fills the "newProject" slot of panel-shell.
import { buttonViews, chatTarget, choiceViews, findRun, previewView, runView, validAnswers } from './wizard-model.js';

/**
 * Helpers the panel shell gives to extensions (see panel-shell app.js).
 * @typedef {object} Shell
 * @property {typeof import('../../panel-shell/src/slots.js').registerSlot} registerSlot
 * @property {typeof import('../../panel-shell/src/api.js').api} api
 * @property {typeof import('../../panel-shell/src/api.js').ApiError} ApiError
 * @property {typeof import('../../panel-shell/src/folder-picker.js').createFolderPicker} createFolderPicker
 * @property {typeof import('../../panel-shell/src/folder-picker.js').showError} showError
 * @property {{ h: typeof import('../../panel-shell/src/dom.js').h, code: typeof import('../../panel-shell/src/dom.js').code, notice: typeof import('../../panel-shell/src/dom.js').notice, plainInput: typeof import('../../panel-shell/src/dom.js').plainInput }} dom
 */

/** @typedef {import('../../panel-shell/src/slots.js').SlotContext} SlotContext */
/** @typedef {{ mode: 'create', name: string } | { mode: 'open', path: string }} PreviewRequest */

/**
 * @param {Shell} shell
 */
export function install(shell) {
  shell.registerSlot('newProject', { create: (ctx) => createWizard(shell, ctx) });
}

/**
 * @param {Shell} shell
 * @param {SlotContext} ctx
 */
function createWizard(shell, ctx) {
  const { h, code, notice, plainInput } = shell.dom;
  const element = h('div', { class: 'screen wizard' });
  /** @type {'create' | 'open'} */
  let mode = 'create';
  /** @type {'name' | 'preview' | 'run'} */
  let stage = 'name';
  /** @type {PreviewRequest | null} */
  let request = null;
  /** @type {Record<string, any> | null} */
  let preview = null;
  /** @type {Record<string, string>} */
  let answers = {};
  /** @type {string | null} */
  let operationId = null;
  let opened = false;
  let navigated = false;
  let busy = false;
  let runKey = '';
  /** @type {Record<string, unknown>} */
  let state = {};

  const message = h('div', { class: 'notice', role: 'alert' });
  message.hidden = true;

  /** @param {unknown} error */
  const fail = (error) => shell.showError(message, error);

  /** @param {string} label @param {() => void} action @param {string} [cls] @returns {HTMLButtonElement} */
  const button = (label, action, cls = 'btn') => {
    const node = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: cls }, [label]));
    node.addEventListener('click', action);
    return node;
  };

  // Stage 1: name (create) or folder (open).
  const nameInput = plainInput({ id: 'wizard-name', name: 'name', maxlength: '100', 'aria-label': 'Имя проекта' });
  const rootLine = h('div', { class: 'sub' });
  const next = /** @type {HTMLButtonElement} */ (h('button', { type: 'submit', class: 'btn primary wide' }, ['Продолжить']));
  const nameForm = h('form', {}, [
    button('Изменить расположение папки для проектов', () => ctx.navigate({ screen: 'settings' }), 'btn wide'),
    rootLine,
    h('div', { class: 'field' }, [h('label', { for: 'wizard-name' }, ['Имя проекта']), nameInput]),
    next,
  ]);
  nameForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void loadPreview({ mode: 'create', name: nameInput.value.trim() });
  });
  const picker = shell.createFolderPicker({
    idPrefix: 'wizard-picker',
    pickLabel: 'Выбрать эту папку',
    onPick: (path) => loadPreview({ mode: 'open', path }),
    onClose: () => ctx.navigate({ screen: 'home' }),
  });
  const nameTitle = h('h2', {}, ['Новый проект']);
  const nameLead = h('p', {}, ['Укажите имя проекта.']);
  const cancelName = button('Отмена', () => ctx.navigate({ screen: 'home' }), 'text-btn');
  const namePanel = h('div', { class: 'panel panel-form' }, [nameTitle, nameLead, nameForm, picker.element, cancelName]);

  /** @param {PreviewRequest} input */
  async function loadPreview(input) {
    if (busy) return;
    busy = true;
    next.disabled = true;
    notice(message, 'muted', '');
    try {
      preview = await shell.api('POST', '/api/setup/preview', input);
      request = input;
      answers = {};
      stage = 'preview';
      draw();
    } catch (error) {
      fail(error);
    } finally {
      busy = false;
      next.disabled = false;
    }
  }

  /** @param {string} provider */
  async function apply(provider) {
    if (busy || !preview) return;
    busy = true;
    notice(message, 'muted', '');
    try {
      const result = await shell.api('POST', '/api/setup/apply', { token: preview['token'], provider, choices: validAnswers(preview, answers) });
      operationId = String(result?.operationId ?? '');
      opened = false;
      navigated = false;
      runKey = '';
      stage = 'run';
      ctx.requestRefresh();
      draw();
    } catch (error) {
      const stale = error instanceof shell.ApiError && (error.code === 'preview-stale' || error.code === 'preview-expired');
      if (stale && request) {
        busy = false;
        await loadPreview(request);
        notice(message, 'muted', 'Папка изменилась с момента предпросмотра: проверьте обновлённый список и нажмите кнопку ещё раз.');
        return;
      }
      fail(error);
    } finally {
      busy = false;
    }
  }

  function previewPanel() {
    if (!preview) return h('div');
    const view = previewView(preview, Date.now());
    const choices = choiceViews(preview, answers).map((choice) =>
      h('fieldset', { class: 'wizard-choice' }, [
        h('legend', {}, [choice.title, choice.required && !choice.answered ? h('span', { class: 'wizard-required' }, [' · нужен ответ']) : null]),
        choice.description ? h('p', {}, [choice.description]) : null,
        ...choice.options.map((option) => {
          const input = /** @type {HTMLInputElement} */ (h('input', { type: 'radio', name: `wizard-${choice.id}`, value: option.id }));
          input.checked = option.checked;
          input.addEventListener('change', () => {
            answers = { ...answers, [choice.id]: option.id };
            draw();
          });
          return h('label', { class: 'wizard-option' }, [input, h('span', {}, [option.title, option.description ? h('small', {}, [option.description]) : null])]);
        }),
      ]),
    );
    const buttons = buttonViews(preview, answers);
    const reasons = [...new Set(buttons.filter((b) => !b.enabled && b.reason).map((b) => b.reason))];
    return h('div', { class: 'panel', }, [
      h('h2', {}, [view.title]),
      h('p', {}, [view.lead]),
      h('div', { class: 'path-box' }, [view.path]),
      h('ul', { class: 'checks' }, view.actions.map((a) => h('li', {}, [h('span', { class: 'ok' }, ['✓']), h('span', {}, [a.title, h('small', {}, [a.detail])])]))),
      h('details', {}, [h('summary', {}, [view.changesLabel]), h('ul', { class: 'wizard-files' }, view.files.map((f) => h('li', {}, [f])))]),
      ...choices,
      view.blocked ? h('div', { class: 'notice notice-error' }, [h('p', {}, [view.blocked.message]), ...view.blocked.commands.map((c) => h('p', {}, [code(c)]))]) : null,
      ...view.notes.map((n) => h('p', { class: 'wizard-note' }, [n])),
      view.expired ? h('div', { class: 'notice notice-muted' }, [h('p', {}, ['Предпросмотр устарел.']), button('Обновить предпросмотр', () => request && void loadPreview(request))]) : null,
      h('div', { class: 'eyebrow' }, ['Первая сессия проекта']),
      h('div', { class: 'session-start' }, buttons.map((b) => {
        const node = button('', () => void apply(b.provider), 'btn prov');
        node.append(h('i', { class: b.provider, 'aria-hidden': 'true' }, [b.letter]), b.label);
        node.disabled = !b.enabled || view.expired;
        if (b.reason) node.title = b.reason;
        return node;
      })),
      ...reasons.map((r) => h('p', { class: 'wizard-reason' }, [r])),
      h('p', {}, ['Проект будет создан, и сразу откроется чат. Модель выбирается внутри приложения. Больше вопросов не будет.']),
      button('Назад', () => {
        stage = 'name';
        draw();
      }, 'text-btn'),
    ].filter((n) => n !== null));
  }

  /** @param {Record<string, any>} run */
  function openChat(run) {
    const target = chatTarget(run['links'] ?? {}, navigator.maxTouchPoints ?? 0);
    if (!target) return false;
    if (target.newTab) return window.open(target.href, '_blank', 'noopener') !== null;
    window.location.assign(target.href);
    return true;
  }

  function runPanel() {
    const run = operationId ? findRun(state, operationId) : null;
    if (!run) return h('div', { class: 'panel' }, [h('h2', {}, ['Готовим проект']), h('ul', { class: 'checks' }, [h('li', {}, [h('span', { class: 'spin' }), 'Запускаем подготовку…'])])]);
    const view = runView(run);
    const provider = run['provider'] === 'claude' ? 'Claude' : 'ChatGPT';
    if (view.status === 'succeeded' && !opened) {
      opened = true;
      if (!openChat(run)) notice(message, 'muted', 'Браузер не открыл чат сам: нажмите «Открыть чат».');
    }
    const actions = [];
    if (view.canCancel) actions.push(button('Отменить подготовку', () => void cancel()));
    if (view.status === 'succeeded') {
      actions.push(button('Открыть чат', () => openChat(run), 'btn primary'));
      if (view.projectId && view.sessionKey) {
        const target = { screen: /** @type {const} */ ('session'), projectId: view.projectId, key: view.sessionKey };
        actions.push(button('Перейти к сессии', () => ctx.navigate(target)));
      }
    }
    if (view.status === 'failed' || view.status === 'cancelled') {
      actions.push(button('Повторить', () => request && void loadPreview(request), 'btn primary'));
      actions.push(button('Закрыть', () => ctx.navigate(view.projectId ? { screen: 'project', projectId: view.projectId } : { screen: 'home' })));
    }
    return h('div', { class: 'screen' }, [
      h('div', { class: 'screen-head' }, [h('h1', {}, [String(run['name'] ?? '')]), h('div', { class: 'sub' }, [`${String(run['path'] ?? '')} · первая сессия в ${provider}`])]),
      h('div', { class: 'panel' }, [
        h('h2', {}, [view.title]),
        h('ul', { class: 'checks' }, view.steps.map((s) =>
          h('li', { class: `wizard-step ${s.status}` }, [
            s.status === 'running' ? h('span', { class: 'spin' }) : h('span', { class: `mark ${s.status}` }, [s.mark]),
            h('span', {}, [s.title, s.note ? h('small', {}, [s.note]) : null]),
          ]))),
        view.error ? h('div', { class: 'notice notice-error' }, [h('p', {}, [view.error.message]), view.error.hint ? h('p', { class: 'notice-hint' }, [view.error.hint]) : null]) : null,
        h('div', { class: 'row' }, actions),
      ]),
    ]);
  }

  async function cancel() {
    if (!operationId) return;
    try {
      await shell.api('POST', `/api/setup/${encodeURIComponent(operationId)}/cancel`);
      ctx.requestRefresh();
    } catch (error) {
      fail(error);
    }
  }

  function draw() {
    if (stage === 'name') {
      const open = mode === 'open';
      nameTitle.textContent = open ? 'Открыть папку проекта' : 'Новый проект';
      nameLead.textContent = open ? 'Выберите папку проекта: Kit добавит в неё инструкции и план.' : 'Укажите имя проекта.';
      nameForm.hidden = open;
      cancelName.hidden = open;
      picker.element.hidden = !open;
      element.replaceChildren(message, namePanel);
    } else if (stage === 'preview') {
      element.replaceChildren(message, previewPanel());
    } else {
      element.replaceChildren(message, runPanel());
    }
  }

  return {
    element,
    /**
     * @param {'create' | 'open'} nextMode
     * @param {Record<string, unknown>} nextState
     * @param {boolean} entered the route just changed to this screen
     */
    show(nextMode, nextState, entered) {
      state = nextState;
      const root = /** @type {{ root?: string }} */ (nextState['projects'] ?? {}).root ?? '';
      rootLine.replaceChildren('Папка для проектов: ', root ? code(root) : '—');
      if (entered || nextMode !== mode) {
        mode = nextMode;
        stage = 'name';
        preview = null;
        operationId = null;
        notice(message, 'muted', '');
        draw();
        if (mode === 'open') void picker.open().catch(fail);
        else nameInput.focus();
        return;
      }
      if (stage !== 'run' || !operationId) return;
      const run = findRun(nextState, operationId);
      const key = JSON.stringify(run);
      if (key === runKey) return;
      runKey = key;
      draw();
      const view = run ? runView(run) : null;
      if (view?.status === 'succeeded' && view.projectId && view.sessionKey && !navigated && sessionListed(nextState, view.projectId, view.sessionKey)) {
        navigated = true;
        ctx.navigate({ screen: 'session', projectId: view.projectId, key: view.sessionKey });
      }
    },
  };
}

/**
 * True once the providers section lists the session (the tree can show it).
 * @param {Record<string, unknown>} state
 * @param {string} projectId
 * @param {string} key
 */
function sessionListed(state, projectId, key) {
  const projects = /** @type {Record<string, Record<string, { sessions?: Array<{ provider: string, localId?: string }> }>>} */ (
    /** @type {{ projects?: unknown }} */ (state['providers'] ?? {}).projects ?? {}
  );
  return Object.values(projects[projectId] ?? {}).some((p) => (p.sessions ?? []).some((s) => `${s.provider}:${s.localId}` === key));
}
