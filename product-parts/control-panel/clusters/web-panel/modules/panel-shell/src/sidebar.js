// @ts-check
// The sidebar (270 px): brand with version and settings, status line of the preparation,
// «Ваши проекты» menu, the project → session tree, the slot of «Ревью плана» and the connection
// indicators. Built once; render(model) updates the parts whose data changed.
import { h, plainInput } from './dom.js';
import { closeMenu, openMenu } from './menus.js';
import { filterProjects, shortPath } from './view-model.js';

/**
 * @typedef {import('./view-model.js').Route} Route
 * @typedef {import('./view-model.js').ProjectRow} ProjectRow
 * @typedef {import('./view-model.js').SessionRow} SessionRow
 * @typedef {import('./view-model.js').Indicator} Indicator
 */

/**
 * @typedef {object} SidebarModel
 * @property {string} version
 * @property {{ text: string, elapsed: string } | null} status
 * @property {ProjectRow[]} tree
 * @property {Array<{ id: string, name: string, path: string }>} projects active projects for the menu
 * @property {string} home home folder, shown as "~" in paths
 * @property {Route} route
 * @property {Indicator[]} indicators
 */

/**
 * @typedef {object} SidebarHandlers
 * @property {(route: Route) => void} navigate
 * @property {() => void} toggleSettings opens the settings, or leaves them when they are open
 * @property {(projectId: string) => void} toggleProject
 * @property {(projectIds: string[]) => void} collapseAll
 * @property {() => void} refreshSessions
 * @property {(project: { id: string, name: string }) => void} archiveProject
 * @property {(projectId: string, provider: string) => void} newSession
 * @property {(text: string) => void} copyText
 * @property {(session: SessionRow) => void} openChat
 * @property {(projectId: string, session: SessionRow, auto?: boolean) => void} openSession
 * @property {(projectId: string, session: SessionRow) => void} renameSession
 * @property {(projectId: string, session: SessionRow, archived: boolean) => void} archiveSession
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * A stroked SVG icon from path data.
 * @param {string[]} paths
 * @param {number} size
 * @returns {SVGSVGElement}
 */
function icon(paths, size) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  for (const [name, value] of Object.entries({ width: String(size), height: String(size), viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'aria-hidden': 'true' })) {
    svg.setAttribute(name, value);
  }
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

const GEAR = [
  'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
];

/**
 * @param {string} label
 * @param {string} cls
 * @returns {HTMLButtonElement}
 */
function iconButton(label, cls = 'icon') {
  return /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: cls, title: label, 'aria-label': label }));
}

/**
 * @param {SidebarHandlers} handlers
 * @returns {{ element: HTMLElement, render: (model: SidebarModel) => void, setReview: (node: Node | null) => void }}
 */
export function createSidebar(handlers) {
  const version = h('small', {}, ['']);
  const gear = iconButton('Настройки', 'icon ml');
  gear.append(icon(GEAR, 20));
  gear.setAttribute('aria-pressed', 'false');
  gear.addEventListener('click', () => handlers.toggleSettings());
  const brand = h('div', { class: 'brand' }, [h('div', { class: 'logo', 'aria-hidden': 'true' }, ['W']), h('div', {}, [h('strong', {}, ['Workflow Kit']), version]), gear]);

  const statusText = h('span', {}, ['']);
  const statusTime = h('span', { class: 't' }, ['']);
  const status = h('div', { class: 'status', role: 'status' }, [h('span', { class: 'spin', 'aria-hidden': 'true' }), statusText, statusTime]);
  status.hidden = true;

  const projectsButton = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'projects-btn', 'aria-expanded': 'false' }, ['Ваши проекты']));
  projectsButton.append(icon(['m6 9 6 6 6-6'], 13));
  const collapse = iconButton('Свернуть все');
  collapse.append(icon(['M4 6h10M4 12h10M4 18h10M18 8l2-2 2 2M18 16l2 2 2-2'], 16));
  const heading = h('div', { class: 'heading' }, [projectsButton, collapse]);

  const search = plainInput({ class: 'search', placeholder: 'Найти проект', 'aria-label': 'Найти проект', enterkeyhint: 'search' });
  const menuList = h('div', { class: 'menu-list' });
  /** @param {string} label @param {() => void} action @returns {HTMLButtonElement} */
  const menuAction = (label, action) => {
    const button = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'menu-item' }, [label]));
    button.addEventListener('click', () => {
      setMenu(false);
      action();
    });
    return button;
  };
  const menu = h('div', { class: 'menu', role: 'dialog', 'aria-label': 'Ваши проекты' }, [
    search,
    menuList,
    h('hr'),
    menuAction('＋  Создать проект', () => handlers.navigate({ screen: 'new', mode: 'create' })),
    menuAction('📂  Открыть папку проекта', () => handlers.navigate({ screen: 'new', mode: 'open' })),
    h('hr'),
    menuAction('↻  Обновить сессии', handlers.refreshSessions),
  ]);
  menu.hidden = true;

  const tree = h('div', { class: 'tree' });
  const review = h('div', { class: 'review-slot' });
  const conn = h('div', { class: 'conn' });
  const foot = h('div', { class: 'foot' }, [conn]);
  const element = h('aside', { class: 'side' }, [brand, status, h('div', { class: 'projects-head' }, [heading, menu]), tree, review, foot]);

  /** @type {SidebarModel | null} */
  let last = null;
  let treeKey = '';

  /** @param {boolean} open */
  function setMenu(open) {
    menu.hidden = !open;
    projectsButton.classList.toggle('open', open);
    projectsButton.setAttribute('aria-expanded', String(open));
    if (open) {
      search.value = '';
      renderMenuList();
      search.focus();
    }
  }

  function renderMenuList() {
    const projects = filterProjects(last?.projects ?? [], search.value);
    const selected = last?.route && 'projectId' in last.route ? last.route.projectId : null;
    menuList.replaceChildren(
      ...(projects.length === 0
        ? [h('p', { class: 'muted menu-empty' }, [search.value ? 'Ничего не найдено' : 'Проектов пока нет'])]
        : projects.map((project) => {
            const open = h('button', { type: 'button', class: 'menu-item' }, [
              h('span', {}, [h('b', {}, [project.name]), h('small', { title: project.path }, [project.id === selected ? 'Выбран' : shortPath(project.path, last?.home ?? '')])]),
            ]);
            open.addEventListener('click', () => {
              setMenu(false);
              handlers.navigate({ screen: 'project', projectId: project.id });
            });
            const archive = h('button', { type: 'button', class: 'link' }, ['В архив']);
            archive.addEventListener('click', () => handlers.archiveProject(project));
            return h('div', { class: 'menu-row' }, [open, archive]);
          })),
    );
  }

  projectsButton.addEventListener('click', () => setMenu(menu.hidden));
  search.addEventListener('input', renderMenuList);
  document.addEventListener('click', (event) => {
    if (menu.hidden || !(event.target instanceof Node)) return;
    if (!menu.contains(event.target) && !projectsButton.contains(event.target)) setMenu(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !menu.hidden) setMenu(false);
  });
  collapse.addEventListener('click', () => handlers.collapseAll((last?.tree ?? []).map((p) => p.id)));

  /**
   * @param {ProjectRow} project
   * @param {Route} route
   * @returns {HTMLElement[]}
   */
  function projectNodes(project, route) {
    const chev = h('button', { type: 'button', class: 'chev', 'aria-label': project.expanded ? 'Свернуть' : 'Развернуть', 'aria-expanded': String(project.expanded) }, [project.expanded ? '⌄' : '›']);
    chev.addEventListener('click', (event) => {
      event.stopPropagation();
      handlers.toggleProject(project.id);
    });
    const more = iconButton('Действия проекта', 'icon ml');
    more.textContent = '⋯';
    more.addEventListener('click', (event) => {
      event.stopPropagation();
      openMenu(more, [
        { label: 'Новая сессия ChatGPT', onSelect: () => handlers.newSession(project.id, 'codex') },
        { label: 'Новая сессия Claude', onSelect: () => handlers.newSession(project.id, 'claude') },
        '-',
        { label: 'Скопировать путь', hint: shortPath(project.path, last?.home ?? ''), onSelect: () => handlers.copyText(project.path) },
        { label: 'В архив', onSelect: () => handlers.archiveProject(project) },
      ]);
    });
    const active = route.screen === 'project' && route.projectId === project.id;
    const row = h('div', { class: `project${active ? ' active' : ''}`, role: 'button', tabindex: '0' }, [
      chev,
      h('span', { class: 'tree-folder', 'aria-hidden': 'true' }, ['📁']),
      h('div', { class: 'grow' }, [h('b', {}, [project.name]), h('small', {}, [project.missing ? 'папка не найдена' : project.count])]),
      more,
    ]);
    const go = () => handlers.navigate({ screen: 'project', projectId: project.id });
    row.addEventListener('click', go);
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') go();
    });
    if (!project.expanded || project.sessions.length === 0) return [row];
    const sessions = h('div', { class: 'sessions' }, project.sessions.map((s) => sessionNode(project.id, s, route)));
    return [row, sessions];
  }

  /**
   * @param {string} projectId
   * @param {SessionRow} session
   * @param {Route} route
   * @returns {HTMLElement}
   */
  function sessionNode(projectId, session, route) {
    const active = route.screen === 'session' && route.key === session.key;
    const more = iconButton('Действия сессии', 'icon dots');
    more.textContent = '⋯';
    more.addEventListener('click', (event) => {
      event.stopPropagation();
      openMenu(more, [
        { label: 'Переименовать', onSelect: () => handlers.renameSession(projectId, session) },
        { label: 'В архив', hint: 'сессия в приложении не удаляется', onSelect: () => handlers.archiveSession(projectId, session, true) },
      ]);
    });
    const meta = [session.when, session.isNew ? 'новая' : null].filter(Boolean).join(' · ');
    const node = h('div', { class: `session${active ? ' active' : ''}`, role: 'button', tabindex: '0' }, [
      more,
      h('div', { class: 'title' }, [h('span', {}, [session.name]), session.working ? h('span', { class: 'spin', title: 'Агент работает' }) : null]),
      h('small', {}, [meta]),
      h('span', { class: `badge ${session.provider}` }, [session.providerLabel]),
    ]);
    // A click on the card opens the session and, for ChatGPT, its chat in the app.
    const go = () => handlers.openSession(projectId, session);
    node.addEventListener('click', go);
    node.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') go();
    });
    return node;
  }

  return {
    element,
    setReview(node) {
      review.replaceChildren(...(node ? [node] : []));
      review.hidden = !node;
    },
    render(model) {
      last = model;
      version.textContent = model.version;
      const inSettings = model.route?.screen === 'settings';
      gear.setAttribute('aria-pressed', String(inSettings));
      gear.title = inSettings ? 'Закрыть настройки' : 'Настройки';
      gear.setAttribute('aria-label', gear.title);
      status.hidden = !model.status;
      statusText.textContent = model.status?.text ?? '';
      statusTime.textContent = model.status?.elapsed ?? '';
      const key = JSON.stringify([model.tree, model.route]);
      if (key !== treeKey) {
        treeKey = key;
        closeMenu();
        // Without a selected project the tree stays empty: the «Ваши проекты» menu has the list,
        // «Проектов пока нет» and the actions to create or open a project.
        tree.replaceChildren(...model.tree.flatMap((p) => projectNodes(p, model.route)));
      }
      if (!menu.hidden) renderMenuList();
      conn.replaceChildren(
        ...model.indicators.map((i) => h('span', { title: i.title }, [h('span', { class: `dot${i.ok ? '' : ' off'}` }), i.label])),
      );
    },
  };
}
