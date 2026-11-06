// @ts-check
// Actions of the sidebar and the screens (archive, restore, sessions, chat links) and the message
// area above the screen. Every action refreshes the state afterwards.
import { api, ApiError } from './api.js';
import { requestRefresh } from './cards.js';
import { h, notice } from './dom.js';
import { deviceLink } from './view-model.js';

/** localStorage key of the collapsed projects of the tree (per device). */
const COLLAPSED_KEY = 'wfk.tree.collapsed';

/** @typedef {import('./view-model.js').Route} Route */
/** @typedef {import('./view-model.js').SessionRow} SessionRow */

/**
 * @param {{ navigate: (route: Route) => void, render: () => void, route: () => Route }} options
 */
export function createActions(options) {
  const { navigate, render } = options;
  const current = options.route;
  /** @type {Set<string>} */
  const collapsed = new Set(readCollapsed());

  /** @returns {string[]} */
  function readCollapsed() {
    try {
      const value = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]');
      return Array.isArray(value) ? value.map(String) : [];
    } catch {
      return [];
    }
  }

  function saveCollapsed() {
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]));
    } catch {
      // Private mode: the tree state lasts until reload.
    }
  }

  const toast = h('div', { class: 'notice', role: 'alert' });
  toast.hidden = true;

  /**
   * Shows the result of an action above the screen.
   * @param {'ok' | 'error' | 'muted'} tone
   * @param {string} text
   * @param {unknown} [error]
   */
  function say(tone, text, error) {
    if (error instanceof ApiError) notice(toast, 'error', `${text}: ${error.message}`, { hint: error.hint, items: error.blockers });
    else notice(toast, tone, error ? `${text}: ${error instanceof Error ? error.message : String(error)}` : text);
    window.scrollTo({ top: 0 });
  }

  /**
   * Runs an action and refreshes the state.
   * @param {string} failure
   * @param {() => Promise<unknown>} action
   */
  async function act(failure, action) {
    notice(toast, 'muted', '');
    try {
      await action();
    } catch (error) {
      say('error', failure, error);
    }
    requestRefresh();
  }

  const handlers = {
    navigate,
    /** @param {string} id */
    toggleProject(id) {
      if (collapsed.has(id)) collapsed.delete(id);
      else collapsed.add(id);
      saveCollapsed();
      render();
    },
    /** @param {string[]} ids */
    collapseAll(ids) {
      const all = ids.every((id) => collapsed.has(id));
      for (const id of ids) {
        if (all) collapsed.delete(id);
        else collapsed.add(id);
      }
      saveCollapsed();
      render();
    },
    refreshSessions() {
      void act('Не удалось обновить сессии', async () => {
        await api('POST', '/api/refresh');
        say('ok', 'Сессии обновляются');
      });
    },
    /** @param {{ id: string, name: string }} project */
    archiveProject(project) {
      if (!window.confirm(`Убрать проект «${project.name}» в архив?\n\nПапка останется на диске; вернуть проект можно в «Архив проектов…».`)) return;
      void act('Не удалось убрать проект в архив', async () => {
        await api('POST', `/api/projects/${encodeURIComponent(project.id)}/archive`);
        const now = current();
        if ((now.screen === 'project' || now.screen === 'session') && now.projectId === project.id) navigate({ screen: 'home' });
        say('ok', `Проект «${project.name}» в архиве`);
      });
    },
    /** @param {{ id: string, name: string }} project */
    restoreProject(project) {
      void act('Не удалось вернуть проект', async () => {
        await api('POST', `/api/projects/${encodeURIComponent(project.id)}/restore`);
        say('ok', `Проект «${project.name}» снова в списке`);
      });
    },
    /** @param {{ id: string, name: string, path: string }} project */
    forgetProject(project) {
      if (!window.confirm(`Убрать проект «${project.name}» из Workflow Kit?\n\nПапка останется на диске:\n${project.path}`)) return;
      void act('Не удалось убрать проект', async () => {
        await api('DELETE', `/api/projects/${encodeURIComponent(project.id)}`);
        say('ok', `Проект «${project.name}» убран, папка осталась на месте`);
      });
    },
    /** @param {string} projectId @param {string} provider */
    newSession(projectId, provider) {
      void act('Не удалось создать сессию', async () => {
        await api('POST', `/api/projects/${encodeURIComponent(projectId)}/providers/${encodeURIComponent(provider)}/sessions`, {});
        say('ok', 'Сессия создаётся — она появится в дереве');
        navigate({ screen: 'project', projectId });
      });
    },
    /** @param {string} text */
    copyText(text) {
      navigator.clipboard?.writeText(text).then(
        () => say('ok', 'Путь скопирован'),
        () => say('muted', text),
      );
    },
    /** @param {string} projectId @param {SessionRow} session */
    renameSession(projectId, session) {
      const name = window.prompt('Имя сессии (пусто — имя по умолчанию)', session.name);
      if (name === null) return;
      void act('Не удалось переименовать сессию', () =>
        api('POST', `/api/projects/${encodeURIComponent(projectId)}/sessions/${encodeURIComponent(session.key)}/title`, { name }));
    },
    /** @param {string} projectId @param {SessionRow} session @param {boolean} archived */
    archiveSession(projectId, session, archived) {
      if (archived && !window.confirm(`Убрать сессию «${session.name}» в архив?\n\nВ приложении ${session.providerLabel} она останется; вернуть её можно на экране проекта.`)) return;
      void act(archived ? 'Не удалось убрать сессию в архив' : 'Не удалось вернуть сессию', async () => {
        await api('POST', `/api/projects/${encodeURIComponent(projectId)}/sessions/${encodeURIComponent(session.key)}/archive`, { archived });
        const now = current();
      if (archived && now.screen === 'session' && now.key === session.key) navigate({ screen: 'project', projectId });
      });
    },
    /** @param {SessionRow} session */
    openChat(session) {
      const link = deviceLink(session.links, navigator.maxTouchPoints ?? 0);
      if (link) window.open(link, '_blank', 'noopener');
      else say('muted', session.note ?? 'У этой сессии нет ссылки');
    },
  };

  return { handlers, toast, say, collapsed };
}
