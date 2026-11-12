// @ts-check
// Screens of the main area that are rebuilt from the state: first start, project and session.
// Each function returns a fresh node; app.js redraws only when its data changed.
import { code, h } from './dom.js';
import { kitLine, kitPanel } from './kit-card.js';

/**
 * @typedef {import('./view-model.js').Route} Route
 * @typedef {import('./view-model.js').ProjectRow} ProjectRow
 * @typedef {import('./view-model.js').SessionRow} SessionRow
 * @typedef {import('./providers.js').ProviderView} ProviderView
 */

/**
 * @typedef {object} ScreenHandlers
 * @property {(route: Route) => void} navigate
 * @property {(projectId: string, provider: string) => void} newSession
 * @property {(session: SessionRow) => void} openChat
 * @property {(projectId: string, session: SessionRow, archived: boolean) => void} archiveSession
 * @property {(projectId: string) => Promise<void>} publish
 * @property {(projectId: string) => Promise<void>} updateKit «Обновить Kit» (M22 2.7)
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
 * A button «Новая сессия в <provider>» for every provider of the service.
 * @param {string} projectId
 * @param {ProviderView[]} providers
 * @param {ScreenHandlers} handlers
 * @returns {HTMLElement}
 */
function sessionButtons(projectId, providers, handlers) {
  const make = (/** @type {ProviderView} */ provider) => {
    const node = button('', () => handlers.newSession(projectId, provider.id), 'btn prov');
    node.append(h('i', { class: provider.id, 'aria-hidden': 'true' }, [provider.mark]), `Новая сессия в ${provider.label}`);
    return node;
  };
  return h('div', { class: 'session-start' }, providers.map(make));
}

/**
 * First start (no projects) or no selection: only the greeting. Creating, opening and choosing a
 * project live in the «Ваши проекты» menu, so the screen repeats none of it.
 * @param {string} names the providers in a sentence (providerNames)
 * @returns {HTMLElement}
 */
export function homeScreen(names) {
  return h('div', { class: 'screen' }, [
    header('Добро пожаловать в Workflow Kit', [`Kit ведёт ваши проекты в ${names}: план, задачи, сессии — на Mac и iPad.`]),
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
 * @param {ProjectRow & { publication?: import('./publication.js').PublicationView | null, kit?: import('./kit-card.js').KitView | null, providerActions?: import('./provider-actions.js').ProviderActionRow[], providers?: ProviderView[] }} project
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
    header(project.name, [code(project.path), ' · ', project.count, ...(project.kit ? [' · ', ...kitLine(project.kit, () => handlers.navigate({ screen: 'new', mode: 'open' }))] : [])]),
    project.missing ? h('div', { class: 'notice notice-error' }, [h('p', {}, ['Папка проекта не найдена. Верните папку на место или уберите проект в архив.'])]) : null,
    project.kit?.card ? kitPanel(project.kit.card, () => handlers.updateKit(project.id)) : null,
    h('div', { class: 'panel' }, [h('h2', {}, ['Сессии']), list, h('div', { class: 'eyebrow' }, ['Новая сессия']), sessionButtons(project.id, project.providers ?? [], handlers)]),
    project.publication ? publicationPanel(project.id, project.publication, handlers) : null,
    project.providerActions && project.providerActions.length > 0 ? providerPanel(project.providerActions, handlers) : null,
    archived,
  ].filter((n) => n !== null));
}

/**
 * Header of the session screen: name, project, provider, start time and a state line (a provider
 * that brings sessions back: the session process; others: the chat opens from the card). The body
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
