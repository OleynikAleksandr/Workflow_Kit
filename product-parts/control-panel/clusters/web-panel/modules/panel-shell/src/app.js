// @ts-check
// Panel bootstrap: the sidebar and the main screen of the agreed layout, routes in location.hash,
// polling of GET /api/state every 3 s; the service cards render inside «Настройки».
import { shouldReload } from './reload.js';
import { providerActionRows } from './provider-actions.js';
import { publicationView } from './publication.js';
import { createActions } from './actions.js';
import { createArchiveScreen } from './archive.js';
import { installPressFeedback } from './press.js';
import { api, ApiError } from './api.js';
import { registerCard, registerCardGroup, requestRefresh, setRefreshHandler } from './cards.js';
import { renderCards } from './card-grid.js';
import { code, facts, h, notice, pill, plainInput } from './dom.js';
import { createFolderPicker, showError } from './folder-picker.js';
import { createNewProjectScreen } from './new-project.js';
import { homeScreen, missingScreen, projectScreen, sessionHeader } from './screens.js';
import { archivedSessions, currentProjectId } from './selection.js';
import { applyTheme, createSettings } from './settings.js';
import { createSidebar } from './sidebar.js';
import { registerSlot, slots } from './slots.js';
import { indicators, providerNames, providerViews } from './providers.js';
import { deviceLink, parseRoute, projectLists, projectTree, routeHash, settingsExit, shortPath, statusLine } from './view-model.js';
import './system-card.js';
import './shared-access-card.js';

/**
 * Panel extensions mounted by the backend under their own prefix; each exports install(shell).
 * They get the shell helpers injected instead of importing panel files by URL.
 */
// The provider cards and «Структура Kit» are no longer in the settings (user decision 2026-11-06):
// the archive covers what they repeated, provider actions are offered by the project wizard.
export const PANEL_EXTENSIONS = ['/project-wizard/project-wizard.js', '/session-view/session-view.js'];

/** Polling interval in milliseconds (D3). */
const POLL_MS = 3000;
/** A request slower than this counts as failed. */
const TIMEOUT_MS = 8000;

/** @typedef {import('./view-model.js').Route} Route */
/** @typedef {import('./view-model.js').SessionRow} SessionRow */

applyTheme();

installPressFeedback();

/** @type {Record<string, unknown>} */
let state = {};
let linked = false;
/** @type {Route} */
let route = parseRoute(location.hash);
/** The screen the user opened the settings from: leaving them goes back there. */
/** @type {Route | null} */
let beforeSettings = null;
/** localStorage key of the project the sidebar tree shows when the route has none. */
const CURRENT_PROJECT_KEY = 'wfk.current-project';
/** @type {string | null} */
let rememberedProject = (() => {
  try {
    return localStorage.getItem(CURRENT_PROJECT_KEY);
  } catch {
    return null;
  }
})();
/** @param {string | null | undefined} id */
function rememberProject(id) {
  if (!id || id === rememberedProject) return;
  rememberedProject = id;
  try {
    localStorage.setItem(CURRENT_PROJECT_KEY, id);
  } catch {
    // Private mode: the choice lasts until reload.
  }
}
if ('projectId' in route) rememberProject(route.projectId);
/** @param {Route} next */
function navigate(next) {
  const hash = routeHash(next);
  if (location.hash !== hash) location.hash = hash;
  else render();
}

const { handlers, toast, say, collapsed } = createActions({ navigate, render: () => render(), route: () => route, providerNames: () => providerNames(state) });

/** @type {import('./slots.js').SlotContext} */
const slotContext = Object.freeze({
  navigate,
  requestRefresh,
  say,
  /** @param {string} projectId */
  selectProject(projectId) {
    rememberProject(projectId);
    render();
  },
  /** @param {string} projectId @param {string} key */
  openSession(projectId, key) {
    handlers.expectSession(projectId, key);
    // The wizard calls it while it is drawn: the next render (out of this one) opens the session.
    setTimeout(render, 0);
  },
});
const leaveSettings = () => navigate(settingsExit(beforeSettings));
const sidebar = createSidebar({ ...handlers, toggleSettings: () => (route.screen === 'settings' ? leaveSettings() : navigate({ screen: 'settings' })) });
const settings = createSettings({ onRootChanged: requestRefresh, onClose: leaveSettings, onArchive: () => navigate({ screen: 'archive' }) });
const archive = createArchiveScreen({
  restoreProjects: handlers.restoreProjects,
  forgetProjects: handlers.forgetProjects,
  deleteProject: handlers.deleteProject,
  restoreSessions: handlers.restoreSessions,
  forgetSessions: handlers.forgetSessions,
  close: () => navigate({ screen: 'settings' }),
});
const builtinNewProject = createNewProjectScreen({
  onDone(projectId) {
    requestRefresh();
    navigate(projectId ? { screen: 'project', projectId } : { screen: 'home' });
  },
  onCancel: () => navigate({ screen: 'home' }),
});
/** @type {{ element: HTMLElement, show: (mode: 'create' | 'open', state: Record<string, unknown>, entered: boolean) => void } | null} */
let wizard = null;
/** Hash of the new project route last shown, to tell the wizard that the user came to it anew. */
let newShown = '';
const newProjectHost = h('div', { class: 'new-project' });
const dynamic = h('div', { class: 'dynamic' });
// The session screen keeps its body node, so typed text in its cards survives polling.
const sessionHead = h('div');
const sessionBody = h('div', { class: 'session-body' });
const sessionScreen = h('div', { class: 'screen' }, [sessionHead, sessionBody]);
let sessionHeadKey = '';
let sessionBodyKey = '';
let reviewKey = '';
const main = h('main', { class: 'main', id: 'main' }, [toast, dynamic, newProjectHost, settings.element, archive.element]);
document.body.prepend(h('div', { class: 'app' }, [sidebar.element, main]));

/** Key of the last drawn dynamic screen, to skip redraws with unchanged data. */
let drawn = '';

function renderMain() {
  const now = Date.now();
  const tree = projectTree(state, { now, collapsed: new Set() });
  // A session the panel asked for opens by itself once it is in the tree (it navigates; the
  // render that follows draws its screen).
  handlers.openArrived(tree);
  settings.element.hidden = route.screen !== 'settings';
  archive.element.hidden = route.screen !== 'archive';
  if (route.screen === 'archive') {
    const lists = projectLists(state);
    archive.render(lists.archived, archivedSessions(tree), lists.home, providerNames(state));
  }
  newProjectHost.hidden = route.screen !== 'new';
  if (route.screen === 'new') {
    if (slots.newProject && !wizard) wizard = slots.newProject.create(slotContext);
    const view = wizard ?? builtinNewProject;
    if (newProjectHost.firstChild !== view.element) newProjectHost.replaceChildren(view.element);
    const entered = newShown !== location.hash;
    newShown = location.hash;
    if (wizard) wizard.show(route.mode, state, entered);
    else builtinNewProject.show(route.mode, projectLists(state).root);
  } else {
    newShown = '';
  }
  if (route.screen === 'settings') settings.render(projectLists(state).root);
  /** @type {[string, unknown, () => Node] | null} */
  let screen = null;
  const r = route;
  if (r.screen === 'home') {
    const names = providerNames(state);
    screen = ['home', [tree.length > 0, names], () => homeScreen(names)];
  } else if (r.screen === 'project') {
    const project = tree.find((p) => p.id === r.projectId);
    const home = projectLists(state).home;
    const shown = project ? { ...project, path: shortPath(project.path, home), publication: publicationView(state, project.id), providerActions: providerActionRows(state), providers: providerViews(state) } : null;
    screen = ['project', shown, () => (shown ? projectScreen(shown, handlers) : missingScreen('Проект не найден', handlers))];
  } else if (r.screen === 'session') {
    const project = tree.find((p) => p.id === r.projectId);
    const session = project?.sessions.find((s) => s.key === r.key);
    const link = session ? deviceLink(session.links, navigator.maxTouchPoints ?? 0) : null;
    // Opening a session its provider resumes brings back its process; the header shows its state.
    if (project && session) handlers.reviveSession(project.id, session);
    const data = project && session ? { project, session, link, status: handlers.sessionStatus(session) } : null;
    if (data) {
      renderSession(data);
      dynamic.hidden = false;
      drawn = '';
      if (dynamic.firstChild !== sessionScreen) dynamic.replaceChildren(sessionScreen);
      return;
    }
    screen = ['session', null, () => missingScreen('Сессия не найдена', handlers)];
  }
  dynamic.hidden = screen === null;
  if (!screen) return;
  const key = JSON.stringify([routeHash(route), screen[1]]);
  if (key === drawn) return;
  drawn = key;
  dynamic.replaceChildren(screen[2]());
}

/**
 * Header and slot body of the session screen, each redrawn only when its data changed.
 * @param {import('./slots.js').SessionContext} data
 */
function renderSession(data) {
  const headKey = JSON.stringify(data);
  if (headKey !== sessionHeadKey) {
    sessionHeadKey = headKey;
    sessionHead.replaceChildren(sessionHeader(data));
  }
  const slot = slots.sessionBody;
  if (!slot) return;
  try {
    const selected = slot.select(state, data);
    const key = JSON.stringify([data.session.key, selected]);
    if (key === sessionBodyKey) return;
    sessionBodyKey = key;
    const node = slot.render(selected, state, data, slotContext);
    if (!node) sessionBody.replaceChildren();
    else if (sessionBody.childNodes.length !== 1 || sessionBody.firstChild !== node) sessionBody.replaceChildren(node);
  } catch (error) {
    sessionBodyKey = '';
    sessionBody.replaceChildren(h('p', { class: 'error' }, [`Ошибка экрана сессии: ${String(error)}`]));
  }
}

/**
 * «Ревью плана» of the selected session in the sidebar (the "sessionReview" slot).
 * @param {import('./view-model.js').ProjectRow[]} tree
 */
function renderReview(tree) {
  const r = route;
  const slot = slots.sessionReview;
  const project = r.screen === 'session' ? tree.find((p) => p.id === r.projectId) : undefined;
  const session = r.screen === 'session' ? project?.sessions.find((s) => s.key === r.key) : undefined;
  if (!slot || !project || !session) {
    if (reviewKey !== '') sidebar.setReview(null);
    reviewKey = '';
    return;
  }
  const context = { project, session, link: null };
  try {
    const selected = slot.select(state, context);
    const key = JSON.stringify([session.key, selected]);
    if (key === reviewKey) return;
    reviewKey = key;
    sidebar.setReview(slot.render(selected, state, context, slotContext));
  } catch (error) {
    reviewKey = '';
    sidebar.setReview(h('p', { class: 'error' }, [`Ошибка «Ревью плана»: ${String(error)}`]));
  }
}

function renderSidebar() {
  const lists = projectLists(state);
  const system = /** @type {{ version?: string }} */ (state['system'] ?? {});
  const tree = projectTree(state, { now: Date.now(), collapsed });
  renderReview(tree);
  // Only the selected project is in the tree; the others are in the «Ваши проекты» menu.
  const current = currentProjectId(route, rememberedProject, tree.map((p) => p.id));
  sidebar.render({
    version: system.version ?? '',
    status: statusLine(state, Date.now()),
    tree: tree.filter((p) => p.id === current),
    projects: lists.active,
    home: lists.home,
    route,
    indicators: indicators(state, linked),
    providers: providerViews(state),
  });
}

function render() {
  renderSidebar();
  renderMain();
}

/** Service version of the first state this page saw (spec M4 13.5). */
/** @type {string | null} */
let loadedVersion = null;

/** Reloads the page once when the service runs another version than the page was loaded for. */
function reloadOnNewVersion(/** @type {string | undefined} */ current) {
  if (!current) return;
  loadedVersion ??= current;
  let reloadedFor = null;
  try {
    reloadedFor = sessionStorage.getItem('wfk-reloaded-for');
  } catch {
    // No storage: the version check alone still prevents a loop.
  }
  if (!shouldReload(loadedVersion, current, reloadedFor)) return;
  try {
    sessionStorage.setItem('wfk-reloaded-for', current);
  } catch {
    // Ignored: see above.
  }
  location.reload();
}

/** Fetches the state once and renders it. */
async function refresh() {
  const controller = new AbortController();
  const abort = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch('/api/state', { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state = /** @type {Record<string, unknown>} */ (await response.json());
    linked = true;
    reloadOnNewVersion(/** @type {{ version?: string }} */ (state['system'] ?? {}).version);
    renderCards(settings.cards, state);
  } catch {
    linked = false;
  } finally {
    clearTimeout(abort);
  }
  render();
}

/** True while a poll is running. */
let inFlight = false;
/** Set when loop() is called during a poll; one more poll follows right after it. */
let again = false;
/** @type {ReturnType<typeof setTimeout> | undefined} */
let timer;

/** Polls forever; the next poll starts after the previous one finishes. */
async function loop() {
  if (inFlight) {
    again = true;
    return;
  }
  clearTimeout(timer);
  inFlight = true;
  try {
    do {
      again = false;
      await refresh();
    } while (again);
  } finally {
    inFlight = false;
  }
  timer = setTimeout(loop, POLL_MS);
}

setRefreshHandler(() => void loop());

/** Helpers given to panel extensions (see PANEL_EXTENSIONS). */
const shell = Object.freeze({
  registerCard,
  registerCardGroup,
  registerSlot,
  requestRefresh,
  api,
  ApiError,
  dom: Object.freeze({ h, facts, pill, code, notice, plainInput }),
  createFolderPicker,
  showError,
});

/**
 * Loads the panel extensions; a failing extension becomes a card with the error.
 * @param {string[]} urls
 */
async function loadExtensions(urls) {
  for (const url of urls) {
    try {
      const extension = await import(url);
      await extension.install(shell);
    } catch (error) {
      const message = `Не удалось загрузить ${url}: ${error instanceof Error ? error.message : String(error)}`;
      registerCard({ id: `extension-${url.replace(/[^a-z0-9]+/gi, '-')}`, title: 'Ошибка панели', order: 1000, select: () => message, render: () => h('p', { class: 'error' }, [message]) });
    }
  }
}

window.addEventListener('hashchange', () => {
  const next = parseRoute(location.hash);
  // The archive is opened from the settings: leaving the settings never returns to it.
  if (next.screen === 'settings' && route.screen !== 'settings' && route.screen !== 'archive') beforeSettings = route;
  route = next;
  if ('projectId' in route) rememberProject(route.projectId);
  notice(toast, 'muted', '');
  render();
  window.scrollTo({ top: 0 });
});

await loadExtensions(PANEL_EXTENSIONS);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void loop();
});

// The status line timer ticks between polls.
setInterval(renderSidebar, 1000);

void loop();
