// @ts-check
// Actions of the sidebar and the screens (archive, restore, sessions, chat links) and the message
// area above the screen. Every action refreshes the state afterwards.
import { api, ApiError } from './api.js';
import { requestRefresh } from './cards.js';
import { h, notice } from './dom.js';
import { commitsLabel } from './publication.js';
import { ARRIVAL_WAIT_MS, arrivedSession, chatStatus, clickOpensThroughService, deviceLink, opensByItself, runningText } from './view-model.js';

/** localStorage key of the collapsed projects of the tree (per device). */
const COLLAPSED_KEY = 'wfk.tree.collapsed';

/** @typedef {import('./view-model.js').Route} Route */
/** @typedef {import('./view-model.js').SessionRow} SessionRow */

/** How long a resume of a session is not repeated (a failed one is retried after it). */
const REVIVE_RETRY_MS = 30_000;

/**
 * @param {{ navigate: (route: Route) => void, render: () => void, route: () => Route, providerNames: () => string }} options
 */
export function createActions(options) {
  const { navigate, render } = options;
  const current = options.route;
  /** @type {Set<string>} */
  const collapsed = new Set(readCollapsed());
  /**
   * A new session the panel opens by itself once it appears in the tree (spec M3-autostart 7).
   * @type {import('./view-model.js').PendingSession | null}
   */
  let pending = null;

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

  /** Sessions being revived: when the resume started and its error, if any. */
  /** @type {Map<string, { at: number, error: string | null }>} */
  const reviving = new Map();

  const handlers = {
    navigate,
    /**
     * Brings back a session that has no live process (opening its screen is the intent to work in
     * it), for a provider that resumes sessions: the service resumes it under the same channel.
     * A failed resume is retried after REVIVE_RETRY_MS, a pending one is not repeated.
     * @param {string} projectId @param {SessionRow} session
     */
    reviveSession(projectId, session) {
      if (!session.resumable || session.state === 'running') {
        reviving.delete(session.key);
        return;
      }
      const entry = reviving.get(session.key);
      if (entry && Date.now() - entry.at < REVIVE_RETRY_MS) return;
      reviving.set(session.key, { at: Date.now(), error: null });
      const sid = session.key.slice(session.key.indexOf(':') + 1);
      api('POST', `/api/projects/${encodeURIComponent(projectId)}/providers/${encodeURIComponent(session.provider)}/sessions/${encodeURIComponent(sid)}/resume`, {}).then(
        () => requestRefresh(),
        (error) => {
          reviving.set(session.key, { at: Date.now(), error: error instanceof Error ? error.message : String(error) });
          render();
        },
      );
    },
    /**
     * State line of the session screen instead of «Открыть чат»: the process state of a session
     * its provider brings back, or that the chat opens from the session card.
     * @param {SessionRow} session
     * @returns {{ text: string, tone: 'ok' | 'muted' | 'error' }}
     */
    sessionStatus(session) {
      if (!session.resumable) return chatStatus(session, deviceLink(session.links, navigator.maxTouchPoints ?? 0));
      if (session.state === 'running') return { text: runningText(session), tone: 'ok' };
      const error = reviving.get(session.key)?.error;
      if (error) return { text: `не удалось поднять сессию: ${error}`, tone: 'error' };
      return { text: 'поднимаем сессию…', tone: 'muted' };
    },
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
      if (!window.confirm(`Убрать проект «${project.name}» в архив?\n\nПапка останется на диске; вернуть проект можно в «Настройки» → «Архив».`)) return;
      void act('Не удалось убрать проект в архив', async () => {
        await api('POST', `/api/projects/${encodeURIComponent(project.id)}/archive`);
        const now = current();
        if ((now.screen === 'project' || now.screen === 'session') && now.projectId === project.id) navigate({ screen: 'home' });
        say('ok', `Проект «${project.name}» в архиве`);
      });
    },
    /** @param {string} projectId @param {string} provider */
    newSession(projectId, provider) {
      void act('Не удалось создать сессию', async () => {
        const since = Date.now();
        await api('POST', `/api/projects/${encodeURIComponent(projectId)}/providers/${encodeURIComponent(provider)}/sessions`, {});
        pending = { projectId, key: null, provider, since };
        say('ok', 'Сессия создаётся — она откроется сама');
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
    /** «Опубликовать на GitHub» (spec publication-order 3.2): a push may take a while. @param {string} projectId */
    async publish(projectId) {
      await act('Не удалось опубликовать', async () => {
        const done = await api('POST', `/api/projects/${encodeURIComponent(projectId)}/publish`, {}, 120_000);
        say('ok', `Опубликовано на GitHub: ${commitsLabel(Number(done.commits) || 0)}, ${String(done.sha).slice(0, 7)}`);
      });
    },
    /** A provider-level action of the project screen. @param {import('./provider-actions.js').ProviderActionRow} action */
    runProviderAction(action) {
      if (action.confirm && !window.confirm(action.confirm)) return;
      void act(`Не удалось — ${action.label}`, async () => {
        try {
          await api('POST', `/api/providers/${encodeURIComponent(action.provider)}/actions/${encodeURIComponent(action.id)}`);
          say('ok', `${action.label} — запущено`);
        } catch (error) {
          // Not needed any more (the state changed meanwhile): the refreshed screen shows it.
          if (!(error instanceof ApiError && error.code === 'action-disabled')) throw error;
        }
      });
    },
    /** @param {string} projectId @param {SessionRow} session @param {boolean} archived */
    archiveSession(projectId, session, archived) {
      if (archived && !window.confirm(`Убрать сессию «${session.name}» в архив?\n\nВ приложении ${session.providerLabel} она останется; вернуть её можно в «Настройки» → «Архив».`)) return;
      void act(archived ? 'Не удалось убрать сессию в архив' : 'Не удалось вернуть сессию', async () => {
        await api('POST', `/api/projects/${encodeURIComponent(projectId)}/sessions/${encodeURIComponent(session.key)}/archive`, { archived });
        const now = current();
      if (archived && now.screen === 'session' && now.key === session.key) navigate({ screen: 'project', projectId });
      });
    },
    // The archive screen (archive.js): bulk actions on the selected rows.
    /** @param {Array<{ id: string, name: string }>} projects */
    async restoreProjects(projects) {
      await act('Не удалось вернуть проекты', async () => {
        for (const p of projects) await api('POST', `/api/projects/${encodeURIComponent(p.id)}/restore`);
        say('ok', projects.length === 1 ? `Проект «${projects[0]?.name}» снова в списке` : `Вернулись проекты: ${projects.length}`);
      });
    },
    /** @param {Array<{ id: string, name: string }>} projects */
    async forgetProjects(projects) {
      const names = projects.map((p) => `«${p.name}»`).join(', ');
      if (!window.confirm(`Убрать из списка Workflow Kit: ${names}?

Папки останутся на диске.`)) return;
      await act('Не удалось убрать проекты из списка', async () => {
        for (const p of projects) await api('DELETE', `/api/projects/${encodeURIComponent(p.id)}`);
        say('ok', `Убраны из списка: ${names}; папки на месте`);
      });
    },
    /** @param {{ id: string, name: string }} project @param {string} confirm @returns {Promise<boolean>} */
    async deleteProject(project, confirm) {
      let done = false;
      await act('Не удалось удалить проект с диска', async () => {
        await api('POST', `/api/projects/${encodeURIComponent(project.id)}/delete-folder`, { confirm });
        done = true;
        say('ok', `Проект «${project.name}» удалён с диска`);
      });
      return done;
    },
    /** @param {Array<{ projectId: string, key: string, name: string }>} sessions */
    async restoreSessions(sessions) {
      await act('Не удалось вернуть сессии', async () => {
        for (const s of sessions) {
          await api('POST', `/api/projects/${encodeURIComponent(s.projectId)}/sessions/${encodeURIComponent(s.key)}/archive`, { archived: false });
        }
        say('ok', sessions.length === 1 ? `Сессия «${sessions[0]?.name}» снова в дереве` : `Вернулись сессии: ${sessions.length}`);
      });
    },
    /** @param {Array<{ projectId: string, key: string, name: string }>} sessions */
    async forgetSessions(sessions) {
      if (!window.confirm(`Убрать из списка Workflow Kit сессий: ${sessions.length}?

Чаты в ${options.providerNames()} останутся.`)) return;
      await act('Не удалось убрать сессии из списка', async () => {
        for (const s of sessions) await api('POST', `/api/projects/${encodeURIComponent(s.projectId)}/sessions/${encodeURIComponent(s.key)}/forget`);
        say('ok', `Убраны из списка сессий: ${sessions.length}`);
      });
    },
    /**
     * Opens the chat of a session in its app. auto: no click of the user (a new session), which a
     * window may refuse to open by itself — on the computer the service opens it (POST
     * /api/open-link), elsewhere (or when the service cannot) a navigation to the link. A web page
     * on a touch device is never opened without a click (opensByItself). A click on a Kimi project
     * link on a computer goes through the service too (clickOpensThroughService).
     * @param {SessionRow} session @param {boolean} [auto]
     */
    openChat(session, auto = false) {
      const points = navigator.maxTouchPoints ?? 0;
      const touch = points > 1;
      const link = deviceLink(session.links, points);
      if (!link) say('muted', session.note ?? 'У этой сессии нет ссылки');
      else if (!auto && clickOpensThroughService(link, points)) api('POST', '/api/open-link', { url: link }).catch(() => window.location.assign(link));
      else if (!auto) window.open(link, '_blank', 'noopener');
      else if (!opensByItself(link, points)) return;
      else if (touch) window.location.assign(link);
      else api('POST', '/api/open-link', { url: link }).catch(() => window.location.assign(link));
    },
    /**
     * A resumed session on a computer: the service switches the provider's app to it (its
     * desktop link). A failure stays silent — the session is in the app anyway.
     * @param {SessionRow} session
     */
    openInDesktop(session) {
      const link = session.links?.desktop;
      if (link) api('POST', '/api/open-link', { url: link }).catch(() => {});
    },
    /**
     * What a click on the session card does: the session screen and the chat in its app by the
     * links of the session. A session its provider brings back opens in the desktop app through
     * the service, on a touch device by a click only (it wakes when its screen is open).
     * @param {string} projectId @param {SessionRow} session @param {boolean} [auto]
     */
    openSession(projectId, session, auto = false) {
      navigate({ screen: 'session', projectId, key: session.key });
      if (!session.resumable) handlers.openChat(session, auto);
      else if ((navigator.maxTouchPoints ?? 0) <= 1) handlers.openInDesktop(session);
      else if (!auto && session.links?.mobile) handlers.openChat(session);
    },
    /** The wizard created the session: open it once it is in the tree. @param {string} projectId @param {string} key */
    expectSession(projectId, key) {
      pending = { projectId, key, provider: null, since: Date.now() };
    },
    /**
     * Called with every tree: opens the awaited session when it has appeared; the wait ends after
     * ARRIVAL_WAIT_MS. @param {import('./view-model.js').ProjectRow[]} tree
     */
    openArrived(tree) {
      if (!pending) return;
      if (Date.now() - pending.since > ARRIVAL_WAIT_MS) {
        pending = null;
        return;
      }
      const found = arrivedSession(tree, pending);
      if (!found) return;
      const { projectId, session } = found;
      const desktop = session.resumable && (navigator.maxTouchPoints ?? 0) <= 1;
      const shown = pending.shown === true;
      if (desktop && !session.links?.desktop) {
        // The desktop link comes later: show the screen now, open the app once it is there.
        if (!shown) setTimeout(() => handlers.openSession(projectId, session, true), 0);
        pending.shown = true;
        return;
      }
      pending = null;
      // Out of the render that found it: navigating inside a render would draw re-entrantly.
      setTimeout(() => {
        if (!shown) handlers.openSession(projectId, session, true);
        else if (desktop) handlers.openInDesktop(session);
      }, 0);
    },
  };

  return { handlers, toast, say, collapsed };
}
