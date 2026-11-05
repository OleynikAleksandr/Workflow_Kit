// @ts-check
// DOM of a provider card, drawn from its view model (card-model.js). The DOM helpers come from the
// panel shell (injected); text is set only through textContent.

/** @typedef {import('./card-model.js').CardModel} CardModel */
/** @typedef {import('./card-model.js').ProjectModel} ProjectModel */
/** @typedef {import('./card-model.js').SessionModel} SessionModel */
/** @typedef {import('./card-model.js').CardMessage} CardMessage */
/** @typedef {import('./model.js').ButtonView} ButtonView */
/** @typedef {import('./model.js').HookRow} HookRow */
/** @typedef {Pick<typeof import('../../panel-shell/src/dom.js'), 'h' | 'pill' | 'code' | 'notice' | 'facts'>} Dom */

/**
 * What the card's controls do; provider-cards.js binds them to the API.
 * @typedef {object} CardHandlers
 * @property {(projectId: string) => void} selectProject
 * @property {() => void} refresh
 * @property {(action: { id: string, title: string, confirm: string | null }, projectId: string | null) => void} runAction
 * @property {() => void} preview
 * @property {() => void} cancelPreview
 * @property {(token: string) => void} grant
 * @property {(row: HookRow) => void} approve
 * @property {() => void} createSession
 * @property {(session: SessionModel, verb: 'resume' | 'stop') => void} session
 * @property {(operationId: string) => void} dismiss
 * @property {() => void} clearMessage
 */

/**
 * @param {string | null} iso
 * @returns {string}
 */
export function formatTime(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}

/**
 * Draws a provider card.
 * @param {CardModel} model
 * @param {Dom} dom
 * @param {CardHandlers} on
 * @returns {HTMLElement}
 */
export function renderCard(model, dom, on) {
  const { h, pill, facts } = dom;

  /**
   * A button with its state: progress while busy, the reason when disabled, the last failure.
   * @param {string} label
   * @param {ButtonView} view
   * @param {() => void} onClick
   * @param {{ primary?: boolean, quiet?: boolean }} [style]
   * @returns {HTMLElement | null}
   */
  function control(label, view, onClick, style = {}) {
    if (!view.shown) return null;
    const cls = ['btn', style.primary ? 'btn-primary' : '', style.quiet ? 'btn-quiet' : ''].filter(Boolean).join(' ');
    const button = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: cls, 'aria-busy': view.busy ? 'true' : undefined }, [label]));
    button.disabled = view.disabled;
    button.addEventListener('click', onClick);
    const box = h('div', { class: 'pc-control' }, [button]);
    if (view.progress) box.append(h('div', { class: 'pc-progress', role: 'status' }, [h('span', { class: 'pc-spinner', 'aria-hidden': 'true' }), view.progress]));
    else if (view.reason) box.append(h('div', { class: 'pc-reason' }, [view.reason]));
    if (view.error) box.append(errorBox(view.error, view.failedId));
    return box;
  }

  /**
   * @param {{ code: string, message: string, hint: string | null }} error
   * @param {string | null} operationId
   * @returns {HTMLElement}
   */
  function errorBox(error, operationId) {
    const box = h('div', { class: 'notice notice-error pc-error', role: 'alert' }, [h('p', {}, [error.message || error.code])]);
    if (error.hint) box.append(h('p', { class: 'notice-hint' }, [error.hint]));
    if (operationId) {
      const hide = h('button', { type: 'button', class: 'pc-link-button' }, ['Скрыть']);
      hide.addEventListener('click', () => on.dismiss(operationId));
      box.append(hide);
    }
    return box;
  }

  /**
   * @param {string} title
   * @param {Array<Node | string | null>} children
   */
  function section(title, children) {
    return h('section', { class: 'pc-section' }, [h('h3', {}, [title]), ...children]);
  }

  const status = model.status;
  const head = h('div', { class: 'pc-head' }, [
    pill(status.label, status.tone),
    status.version ? h('span', { class: 'pc-version' }, [status.version]) : null,
    control('Перепроверить', model.refresh, on.refresh, { quiet: true }),
  ]);
  /** @type {Array<[string, Node | string]>} */
  const rows = [];
  if (status.installed !== null) rows.push(['Установлен', status.installed ? 'да' : 'нет']);
  rows.push(['Версия CLI', status.version ?? '—']);
  if (status.path) rows.push(['Путь', dom.code(status.path)]);
  for (const [label, value] of status.details) rows.push([label, value]);
  rows.push(['Проверено', formatTime(status.checkedAt)]);

  const root = h('div', { class: 'pc-card' }, [head, facts(rows)]);
  if (status.note) root.append(h('p', { class: 'muted pc-note' }, [status.note]));
  if (model.unavailable.length > 0) {
    root.append(
      h('details', { class: 'pc-unavailable' }, [
        h('summary', {}, [`Недоступно: ${model.unavailable.length}`]),
        h('ul', { class: 'plain' }, model.unavailable.map((item) => h('li', {}, [h('strong', {}, [item.label]), ` — ${item.reason}`]))),
      ]),
    );
  }
  for (const error of model.errors) root.append(errorBox({ ...error, message: `${error.label}: ${error.message}` }, null));
  if (model.actions.length > 0) {
    root.append(h('div', { class: 'actions pc-actions' }, model.actions.map((a) => control(a.title, a.button, () => on.runAction(a, null)))));
  }
  if (model.message) {
    const message = h('div', { class: `notice notice-${model.message.tone} pc-message`, role: 'status' }, [h('p', {}, [model.message.text])]);
    if (model.message.hint) message.append(h('p', { class: 'notice-hint' }, [model.message.hint]));
    const close = h('button', { type: 'button', class: 'pc-link-button' }, ['Скрыть']);
    close.addEventListener('click', on.clearMessage);
    message.append(close);
    root.append(message);
  }
  root.append(projectPicker(model));
  if (model.project) root.append(...projectParts(model.project));
  return root;

  /**
   * @param {CardModel} card
   * @returns {HTMLElement}
   */
  function projectPicker(card) {
    const list = card.projects.list;
    if (list.length === 0) return h('p', { class: 'muted pc-project' }, ['Нет проектов: добавьте проект в карточке «Проекты».']);
    if (list.length === 1) return h('div', { class: 'pc-project' }, [h('span', { class: 'muted' }, ['Проект: ']), h('strong', {}, [list[0]?.name ?? ''])]);
    const select = /** @type {HTMLSelectElement} */ (h('select', { class: 'pc-select', 'aria-label': 'Проект' }));
    for (const project of list) {
      const option = /** @type {HTMLOptionElement} */ (h('option', { value: project.id }, [project.name]));
      option.selected = project.id === card.projects.selectedId;
      select.append(option);
    }
    select.addEventListener('change', () => on.selectProject(select.value));
    return h('label', { class: 'pc-project' }, [h('span', { class: 'muted' }, ['Проект ']), select]);
  }

  /**
   * @param {ProjectModel} project
   * @returns {HTMLElement[]}
   */
  function projectParts(project) {
    /** @type {HTMLElement[]} */
    const parts = [];
    if (project.missing) parts.push(h('p', { class: 'error' }, ['Папка проекта не найдена: ', dom.code(project.path)]));
    if (!project.loaded) parts.push(h('p', { class: 'muted' }, ['Состояние проекта ещё не получено.']));
    for (const error of project.errors) parts.push(errorBox({ ...error, message: `${error.label}: ${error.message}` }, null));
    parts.push(trustPart(project), hooksPart(project), sessionsPart(project));
    if (project.actions.length > 0) {
      parts.push(section('Действия', [h('div', { class: 'actions pc-actions' }, project.actions.map((a) => control(a.title, a.button, () => on.runAction(a, project.id))))]));
    }
    return parts;
  }

  /**
   * @param {ProjectModel} project
   * @returns {HTMLElement}
   */
  function trustPart(project) {
    const trust = project.trust;
    const line = h('div', { class: 'pc-line' }, [pill(trust.label, trust.tone)]);
    /** @type {Array<Node | string | null>} */
    const children = [line];
    // The note often repeats the reason under the disabled button; show it once.
    if (trust.note && trust.note !== trust.preview.reason) children.push(h('p', { class: 'muted pc-note' }, [trust.note]));
    if (trust.backup) children.push(h('p', { class: 'muted pc-note' }, ['Копия конфига: ', dom.code(trust.backup)]));
    const preview = trust.previewData;
    if (!preview) {
      children.push(control('Предпросмотр доверия…', trust.preview, on.preview));
      if (trust.grant.busy || trust.grant.error) children.push(control('Доверять', { ...trust.grant, disabled: true }, () => undefined));
      return section('Доверие к папке', children);
    }
    const box = h('div', { class: 'pc-preview' });
    if (preview.trusted) box.append(h('p', {}, ['Папка уже доверена: записывать нечего.']));
    if (preview.writes.length > 0) {
      box.append(
        h('h4', {}, ['Будет записано']),
        h('ul', { class: 'pc-list' }, preview.writes.map((w) => h('li', {}, [dom.code(w.key ? `${w.file} → ${w.key}` : w.file), h('div', { class: 'muted' }, [w.description])]))),
      );
    }
    box.append(h('h4', {}, ['Точки автозапуска в папке']));
    box.append(
      preview.autorun.length === 0
        ? h('p', { class: 'muted' }, ['Не найдены.'])
        : h('ul', { class: 'pc-list' }, preview.autorun.map((a) => h('li', {}, [dom.code(a.file), ' ', pill(a.kind, 'warn'), h('div', { class: 'muted' }, [a.detail])]))),
    );
    for (const note of preview.notes) box.append(h('p', { class: 'muted pc-note' }, [note]));
    box.append(h('p', { class: preview.expired ? 'error pc-note' : 'muted pc-note' }, [preview.expired ? 'Предпросмотр устарел: откройте его заново.' : `Подтверждение действует до ${formatTime(preview.expiresAt)}.`]));
    const buttons = h('div', { class: 'actions' }, [
      preview.trusted || preview.expired ? null : control('Доверять', trust.grant, () => on.grant(preview.token), { primary: true }),
      preview.expired ? control('Обновить предпросмотр', trust.preview, on.preview) : null,
      h('div', { class: 'pc-control' }, [button('Закрыть', on.cancelPreview)]),
    ]);
    box.append(buttons);
    children.push(box);
    return section('Доверие к папке', children);
  }

  /**
   * @param {string} label
   * @param {() => void} onClick
   */
  function button(label, onClick) {
    const node = h('button', { type: 'button', class: 'btn' }, [label]);
    node.addEventListener('click', onClick);
    return node;
  }

  /**
   * @param {ProjectModel} project
   * @returns {HTMLElement}
   */
  function hooksPart(project) {
    const hooks = project.hooks;
    /** @type {Array<Node | string | null>} */
    const children = [];
    if (hooks.incomplete) children.push(h('p', { class: 'pc-warn' }, ['Список сессий неполон: хук Kit не активен.']));
    const reason = hooks.gate.enabled ? null : hooks.gate.reason;
    if (reason) children.push(h('p', { class: 'pc-reason' }, [reason]));
    if (hooks.note && hooks.note !== reason) children.push(h('p', { class: 'muted pc-note' }, [hooks.note]));
    if (hooks.rows.length === 0 && !reason) children.push(h('p', { class: 'muted' }, ['Хуков нет.']));
    else {
      children.push(
        h('ul', { class: 'pc-list' }, hooks.rows.map((row) =>
          h('li', { class: 'pc-hook' }, [
            h('div', { class: 'pc-line' }, [pill(row.kit ? 'Kit' : 'чужой', row.kit ? 'ok' : 'muted'), pill(row.label, row.tone)]),
            h('div', {}, [h('span', { class: 'muted' }, ['Команда: ']), dom.code(row.command)]),
            h('div', { title: row.hash }, [h('span', { class: 'muted' }, ['Хеш: ']), dom.code(row.shortHash)]),
            row.key ? h('div', { class: 'muted pc-note' }, [row.key]) : null,
            row.approve ? control('Одобрить хук…', row.approve, () => on.approve(row), { primary: true }) : null,
          ]),
        )),
      );
    }
    return section('Хуки', children);
  }

  /**
   * @param {ProjectModel} project
   * @returns {HTMLElement}
   */
  function sessionsPart(project) {
    const sessions = project.sessions;
    /** @type {Array<Node | string | null>} */
    const children = [control('Создать сессию', sessions.create, on.createSession, { primary: true })];
    const listReason = sessions.gate.enabled ? null : sessions.gate.reason;
    if (listReason && listReason !== sessions.create.reason) children.push(h('p', { class: 'pc-reason' }, [`Список сессий: ${listReason}`]));
    if (sessions.list.length === 0) children.push(h('p', { class: 'muted' }, ['Сессий нет.']));
    else children.push(h('ul', { class: 'pc-list pc-sessions' }, sessions.list.map(sessionRow)));
    return section(`Сессии (${sessions.list.length})`, children);
  }

  /**
   * @param {SessionModel} session
   * @returns {HTMLElement}
   */
  function sessionRow(session) {
    const meta = [session.origin, formatTime(session.createdAt), session.model].filter(Boolean).join(' · ');
    /** @type {Array<Node | null>} */
    const tools = [];
    if (session.link) {
      const attrs = session.link.web ? { target: '_blank', rel: 'noopener noreferrer' } : {};
      tools.push(h('a', { class: 'btn pc-open', href: session.link.href, ...attrs }, [session.link.kind === 'web' ? 'Открыть в браузере' : 'Открыть']));
    }
    tools.push(control('Возобновить', session.resume, () => on.session(session, 'resume')));
    tools.push(control('Остановить', session.stop, () => on.session(session, 'stop')));
    return h('li', { class: 'pc-session' }, [
      h('div', { class: 'pc-session-main' }, [
        h('div', { class: 'pc-line' }, [h('strong', {}, [session.title]), pill(session.state.label, session.state.tone)]),
        h('div', { class: 'muted pc-note' }, [meta]),
        session.note ? h('div', { class: 'muted pc-note' }, [session.note]) : null,
      ]),
      h('div', { class: 'actions' }, tools),
    ]);
  }
}
