// @ts-check
// Screens of the main area that are rebuilt from the state: first start, project and session.
// Each function returns a fresh node; app.js redraws only when its data changed.
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
 * @property {(projectId: string, session: SessionRow, archived: boolean) => void} archiveSession
 * @property {(projectId: string) => Promise<void>} publish
 * @property {(action: import('./provider-actions.js').ProviderActionRow) => void} runProviderAction
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
 * First start (no projects) or no selection: only the greeting. Creating, opening and choosing a
 * project live in the «Ваши проекты» menu, so the screen repeats none of it.
 * @returns {HTMLElement}
 */
export function homeScreen() {
  return h('div', { class: 'screen' }, [
    header('Добро пожаловать в Workflow Kit', ['Kit ведёт ваши проекты в ChatGPT и Claude: план, задачи, сессии — на Mac и iPad.']),
  ]);
}

/**
 * The «GitHub» panel (spec publication-order 3.2): state text and the publish button.
 * @param {string} projectId
 * @param {import('./publication.js').PublicationView} view
 * @param {ScreenHandlers} handlers
 * @returns {HTMLElement}
 */
function publicationPanel(projectId, view, handlers) {
  const children = [h('h2', {}, ['GitHub']), h('p', { class: `pub-${view.tone}` }, [view.text])];
  if (view.button) {
    const node = button(view.button, () => {
      node.disabled = true;
      node.textContent = 'Публикуем…';
      void handlers.publish(projectId).finally(() => (node.disabled = false));
    }, 'btn primary');
    children.push(node);
  }
  return h('div', { class: 'panel' }, children);
}

/**
 * Provider-level actions (start a daemon, remove a global hook): offered for every provider, also
 * a ready one, so they are reachable from an existing project and not only from the wizard.
 * @param {import('./provider-actions.js').ProviderActionRow[]} rows
 * @param {ScreenHandlers} handlers
 * @returns {HTMLElement}
 */
function providerPanel(rows, handlers) {
  return h('div', { class: 'panel' }, [
    h('h2', {}, ['Провайдеры']),
    h('div', { class: 'row' }, rows.map((row) => button(row.label, () => handlers.runProviderAction(row)))),
  ]);
}

/**
 * A project without a selected session: its sessions and new session buttons.
 * @param {ProjectRow & { publication?: import('./publication.js').PublicationView | null, providerActions?: import('./provider-actions.js').ProviderActionRow[] }} project
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
    project.publication ? publicationPanel(project.id, project.publication, handlers) : null,
    project.providerActions && project.providerActions.length > 0 ? providerPanel(project.providerActions, handlers) : null,
    archived,
  ].filter((n) => n !== null));
}

/**
 * Header of the session screen: name, project, provider, start time and a state line (Claude: the
 * session process, it is revived; ChatGPT: the chat opens from the session card). The body
 * (activity, choice and plan cards) comes from the "sessionBody" slot.
 * @param {{ project: ProjectRow, session: SessionRow, link: string | null, status?: { text: string, tone: string } | null }} data
 * @returns {HTMLElement}
 */
export function sessionHeader(data) {
  const { project, session } = data;
  const open = data.status
    ? h('span', { class: data.status.tone === 'error' ? 'error' : data.status.tone === 'ok' ? 'ok' : 'muted' }, [data.status.text])
    : h('span', { class: 'muted' }, [session.note ?? 'ссылки нет']);
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
