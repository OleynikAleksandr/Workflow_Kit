// @ts-check
// Screens of the main area that are rebuilt from the state: first start, project, session and the
// project archive. Each function returns a fresh node; app.js redraws only when its data changed.
import { code, h } from './dom.js';
import { providerLabel } from './view-model.js';

/**
 * @typedef {import('./view-model.js').Route} Route
 * @typedef {import('./view-model.js').ProjectRow} ProjectRow
 * @typedef {import('./view-model.js').SessionRow} SessionRow
 */

/**
 * @typedef {object} ScreenHandlers
 * @property {(route: Route) => void} navigate
 * @property {(projectId: string, provider: string) => void} newSession
 * @property {(session: SessionRow) => void} openChat
 * @property {(project: { id: string, name: string }) => void} restoreProject
 * @property {(project: { id: string, name: string, path: string }) => void} forgetProject
 * @property {(projectId: string, session: SessionRow, archived: boolean) => void} archiveSession
 */

/**
 * @param {string} title
 * @param {Array<Node | string | null>} sub
 * @returns {HTMLElement}
 */
function header(title, sub) {
  return h('div', { class: 'screen-head' }, [h('h1', {}, [title]), h('div', { class: 'sub' }, sub)]);
}

/**
 * @param {string} label
 * @param {() => void} action
 * @param {string} [cls]
 * @returns {HTMLButtonElement}
 */
function button(label, action, cls = 'btn') {
  const node = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: cls }, [label]));
  node.addEventListener('click', action);
  return node;
}

/**
 * Two buttons «Создать и открыть в ChatGPT / Claude» style for a new session of a project.
 * @param {string} projectId
 * @param {ScreenHandlers} handlers
 * @returns {HTMLElement}
 */
function sessionButtons(projectId, handlers) {
  const make = (/** @type {string} */ provider, /** @type {string} */ letter) => {
    const node = button('', () => handlers.newSession(projectId, provider), 'btn prov');
    node.append(h('i', { class: provider, 'aria-hidden': 'true' }, [letter]), `Новая сессия в ${providerLabel(provider)}`);
    return node;
  };
  return h('div', { class: 'session-start' }, [make('codex', 'G'), make('claude', 'C')]);
}

/**
 * First start (no projects) or no selection.
 * @param {{ hasProjects: boolean }} data
 * @param {ScreenHandlers} handlers
 * @returns {HTMLElement}
 */
export function homeScreen(data, handlers) {
  return h('div', { class: 'screen' }, [
    header('Добро пожаловать в Workflow Kit', ['Kit ведёт ваши проекты в ChatGPT и Claude: план, задачи, сессии — на Mac и iPad.']),
    h('div', { class: 'panel' }, [
      h('h2', {}, [data.hasProjects ? 'Выберите проект слева' : 'Начните с проекта']),
      h('p', {}, ['Создайте новую папку проекта или откройте существующую. Kit добавит инструкции, документацию и план, а затем откроет первую сессию.']),
      h('div', { class: 'row' }, [
        button('Создать проект', () => handlers.navigate({ screen: 'new', mode: 'create' }), 'btn primary'),
        button('Открыть папку проекта', () => handlers.navigate({ screen: 'new', mode: 'open' })),
      ]),
    ]),
  ]);
}

/**
 * A project without a selected session: its sessions and new session buttons.
 * @param {ProjectRow} project
 * @param {ScreenHandlers} handlers
 * @returns {HTMLElement}
 */
export function projectScreen(project, handlers) {
  const list = project.sessions.length === 0
    ? h('p', {}, ['Сессий пока нет.'])
    : h('ul', { class: 'checks' }, project.sessions.map((s) => {
        const item = h('li', { class: 'link-row', role: 'button', tabindex: '0' }, [
          h('span', { class: `badge-inline ${s.provider}` }, [s.providerLabel]),
          h('span', {}, [s.name, h('small', {}, [s.when])]),
        ]);
        item.addEventListener('click', () => handlers.navigate({ screen: 'session', projectId: project.id, key: s.key }));
        return item;
      }));
  const archived = project.archived.length === 0
    ? null
    : h('div', { class: 'panel' }, [
        h('h2', {}, ['Сессии в архиве']),
        h('ul', { class: 'checks' }, project.archived.map((s) =>
          h('li', { class: 'archive-row' }, [
            h('span', { class: `badge-inline ${s.provider}` }, [s.providerLabel]),
            h('span', { class: 'grow' }, [s.name, h('small', {}, [s.when])]),
            button('Вернуть', () => handlers.archiveSession(project.id, s, false)),
          ]))),
      ]);
  return h('div', { class: 'screen' }, [
    header(project.name, [code(project.path), ' · ', project.count]),
    project.missing ? h('div', { class: 'notice notice-error' }, [h('p', {}, ['Папка проекта не найдена. Верните папку на место или уберите проект в архив.'])]) : null,
    h('div', { class: 'panel' }, [h('h2', {}, ['Сессии']), list, h('div', { class: 'eyebrow' }, ['Новая сессия']), sessionButtons(project.id, handlers)]),
    archived,
  ].filter((n) => n !== null));
}

/**
 * Header of the session screen: name, project, provider, start time and «Открыть чат». The body
 * (activity, choice and plan cards) comes from the "sessionBody" slot.
 * @param {{ project: ProjectRow, session: SessionRow, link: string | null }} data
 * @returns {HTMLElement}
 */
export function sessionHeader(data) {
  const { project, session } = data;
  const open = data.link ? h('a', { href: data.link, class: 'chat-link', target: '_blank', rel: 'noopener' }, ['Открыть чат']) : h('span', { class: 'muted' }, [session.note ?? 'ссылки нет']);
  return header(session.name, [`${project.name} · ${session.providerLabel} · начата ${session.when} · `, open]);
}

/**
 * A session or project that no longer exists.
 * @param {string} text
 * @param {ScreenHandlers} handlers
 * @returns {HTMLElement}
 */
export function missingScreen(text, handlers) {
  return h('div', { class: 'screen' }, [
    h('div', { class: 'panel' }, [h('h2', {}, [text]), h('div', { class: 'row' }, [button('На главный экран', () => handlers.navigate({ screen: 'home' }))])]),
  ]);
}

/**
 * «Архив проектов»: return to the list or remove from Workflow Kit (folders stay on disk).
 * @param {Array<{ id: string, name: string, path: string, archivedAt?: string }>} archived
 * @param {ScreenHandlers} handlers
 * @returns {HTMLElement}
 */
export function archiveScreen(archived, handlers) {
  const rows = archived.map((project) =>
    h('li', { class: 'archive-row' }, [
      h('span', { class: 'grow' }, [h('b', {}, [project.name]), h('small', {}, [project.path])]),
      button('Вернуть', () => handlers.restoreProject(project)),
      button('Убрать из списка', () => handlers.forgetProject(project), 'btn quiet'),
    ]),
  );
  return h('div', { class: 'screen' }, [
    header('Архив проектов', ['Проекты в архиве не видны в дереве. Папки на диске не удаляются.']),
    h('div', { class: 'panel' }, [rows.length === 0 ? h('p', {}, ['Архив пуст.']) : h('ul', { class: 'checks' }, rows)]),
  ]);
}
