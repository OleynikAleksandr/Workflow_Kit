// @ts-check
// Pure view models of the panel layout (no DOM): routes, the project and session tree, the
// connection indicators and the status line. Covered by node --test.

/** Provider names shown to the user; the id stays technical. */
export const PROVIDER_LABELS = Object.freeze({ codex: 'ChatGPT', claude: 'Claude' });

/** Default name of a session without one (session-titles DEFAULT_NAME). */
export const DEFAULT_SESSION_NAME = 'Новая сессия';

/** A session counts as "новая" this long after creation while the agent has not answered yet. */
export const NEW_SESSION_MS = 60 * 60 * 1000;

/** Theme choices of the "Внешний вид" settings. */
export const THEMES = Object.freeze(['system', 'light', 'dark']);

/**
 * @typedef {{ screen: 'home' }
 *   | { screen: 'settings' }
 *   | { screen: 'new', mode: 'create' | 'open' }
 *   | { screen: 'archive' }
 *   | { screen: 'project', projectId: string }
 *   | { screen: 'session', projectId: string, key: string }} Route
 */

/**
 * Parses location.hash into a route; anything unknown is the home screen.
 * @param {string} hash
 * @returns {Route}
 */
export function parseRoute(hash) {
  const parts = hash.replace(/^#\/?/, '').split('/').map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return '';
    }
  });
  const [head, a, b] = parts;
  if (head === 'settings') return { screen: 'settings' };
  if (head === 'new') return { screen: 'new', mode: 'create' };
  if (head === 'open') return { screen: 'new', mode: 'open' };
  if (head === 'archive') return { screen: 'archive' };
  if (head === 'p' && a) return { screen: 'project', projectId: a };
  if (head === 's' && a && b) return { screen: 'session', projectId: a, key: b };
  return { screen: 'home' };
}

/**
 * Where leaving the settings goes: the screen the user came from, else home.
 * @param {Route | null | undefined} before
 * @returns {Route}
 */
export function settingsExit(before) {
  return before && before.screen !== 'settings' ? before : { screen: 'home' };
}

/**
 * The hash of a route (inverse of parseRoute).
 * @param {Route} route
 * @returns {string}
 */
export function routeHash(route) {
  switch (route.screen) {
    case 'settings':
    case 'archive':
      return `#/${route.screen}`;
    case 'new':
      return route.mode === 'open' ? '#/open' : '#/new';
    case 'project':
      return `#/p/${encodeURIComponent(route.projectId)}`;
    case 'session':
      return `#/s/${encodeURIComponent(route.projectId)}/${encodeURIComponent(route.key)}`;
    default:
      return '#/';
  }
}

/**
 * Key of a session in the channel, titles and review sections: "<provider>:<localId>".
 * @param {{ provider: string, localId?: string | null, remoteId?: string }} session
 * @returns {string | null}
 */
export function sessionKey(session) {
  const id = session.localId ?? session.remoteId;
  return id ? `${session.provider}:${id}` : null;
}

/**
 * Provider name for the user.
 * @param {string} id
 * @returns {string}
 */
export function providerLabel(id) {
  return /** @type {Record<string, string>} */ (PROVIDER_LABELS)[id] ?? id;
}

/**
 * "06.11, 08:07" in local time; "" for an invalid date.
 * @param {string | null | undefined} iso
 * @returns {string}
 */
export function formatWhen(iso) {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  const two = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `${two(date.getDate())}.${two(date.getMonth() + 1)}, ${two(date.getHours())}:${two(date.getMinutes())}`;
}

/**
 * "16 с", "1:05", "1:02:03".
 * @param {number} ms
 * @returns {string}
 */
export function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  if (total < 60) return `${total} с`;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/**
 * Russian plural of "сессия".
 * @param {number} n
 * @returns {string}
 */
export function sessionsLabel(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} сессия`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} сессии`;
  return `${n} сессий`;
}

/**
 * @param {unknown} value
 * @returns {Record<string, any>}
 */
function record(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? /** @type {Record<string, any>} */ (value) : {};
}

/**
 * Projects of the "projects" section split into the active list and the archive.
 * @param {Record<string, unknown>} state
 * @returns {{ active: any[], archived: any[], root: string, home: string, error: string | null }}
 */
export function projectLists(state) {
  const section = record(state['projects']);
  const all = Array.isArray(section['projects']) ? section['projects'] : [];
  const byName = (/** @type {any} */ a, /** @type {any} */ b) => String(a.name).localeCompare(String(b.name), 'ru');
  return {
    active: all.filter((p) => !p.archivedAt).sort(byName),
    archived: all.filter((p) => p.archivedAt).sort(byName),
    root: typeof section['root'] === 'string' ? section['root'] : '',
    home: typeof section['home'] === 'string' ? section['home'] : '',
    error: typeof section['error'] === 'string' ? section['error'] : null,
  };
}

/**
 * A path with the home folder shown as "~".
 * @param {string} path
 * @param {string} home
 * @returns {string}
 */
export function shortPath(path, home) {
  if (!home) return path;
  if (path === home) return '~';
  return path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

/**
 * Projects whose name or path contains the query (case-insensitive).
 * @template {{ name: string, path: string }} T
 * @param {T[]} projects
 * @param {string} query
 * @returns {T[]}
 */
export function filterProjects(projects, query) {
  const q = query.trim().toLocaleLowerCase('ru');
  if (!q) return projects;
  return projects.filter((p) => p.name.toLocaleLowerCase('ru').includes(q) || p.path.toLocaleLowerCase('ru').includes(q));
}

/**
 * @typedef {object} SessionRow
 * @property {string} key
 * @property {string} provider
 * @property {string} providerLabel
 * @property {string} name
 * @property {string} when
 * @property {boolean} isNew
 * @property {boolean} working The agent works on an answer (spinner).
 * @property {string} activity channel state or ""
 * @property {Record<string, string>} links
 * @property {string | null} note
 * @property {string} createdAt
 * @property {string} state process state from the provider: running, stopped or unknown
 */

/**
 * @typedef {object} ProjectRow
 * @property {string} id
 * @property {string} name
 * @property {string} path
 * @property {boolean} missing
 * @property {string} count "2 сессии"
 * @property {boolean} expanded
 * @property {SessionRow[]} sessions newest first, without the archived ones
 * @property {SessionRow[]} archived sessions put into the archive, newest first
 */

/**
 * The plan objective when the session owns the project's active scope (spec section 11: the
 * name after the manual one and the agent's topic); null otherwise.
 * @param {Record<string, unknown>} state
 * @param {string} projectId
 * @param {unknown} localId
 * @returns {string | null}
 */
export function ownerObjective(state, projectId, localId) {
  const view = record(record(record(state['workflow'])['projects'])[projectId]);
  const objective = record(view['scope'])['objective'];
  const owner = record(view['execution'])['ownerSession'];
  return typeof objective === 'string' && objective !== '' && typeof owner === 'string' && owner === localId ? objective : null;
}

/**
 * The tree "project → sessions" of the sidebar.
 * @param {Record<string, unknown>} state
 * @param {{ now: number, collapsed: ReadonlySet<string> }} ui
 * @returns {ProjectRow[]}
 */
export function projectTree(state, ui) {
  const providerProjects = record(record(state['providers'])['projects']);
  const titles = record(record(state['titles'])['projects']);
  const channel = Array.isArray(record(state['channel'])['sessions']) ? record(state['channel'])['sessions'] : [];
  /** @type {Map<string, any>} */
  const activity = new Map(channel.map((/** @type {any} */ a) => [a.key, a]));
  return projectLists(state).active.map((project) => {
    /** @type {SessionRow[]} */
    const sessions = [];
    /** @type {SessionRow[]} */
    const archived = [];
    for (const providerState of Object.values(record(providerProjects[project.id]))) {
      for (const info of Array.isArray(providerState?.sessions) ? providerState.sessions : []) {
        const key = sessionKey(info);
        if (!key) continue;
        const title = record(record(titles[project.id])[key]);
        // «Убрать из списка» in the archive: the session is gone from Workflow Kit for good.
        if (title['forgottenAt']) continue;
        const act = activity.get(key);
        const created = Date.parse(info.createdAt);
        const name = typeof title['name'] === 'string' && title['source'] !== 'default' ? title['name'] : ownerObjective(state, project.id, info.localId) || info.title || DEFAULT_SESSION_NAME;
        (title['archivedAt'] ? archived : sessions).push({
          key,
          provider: info.provider,
          providerLabel: providerLabel(info.provider),
          name,
          when: formatWhen(info.createdAt),
          isNew: !act?.lastStopAt && Number.isFinite(created) && ui.now - created < NEW_SESSION_MS,
          working: act?.state === 'working',
          activity: typeof act?.state === 'string' ? act.state : '',
          links: record(info.links),
          note: typeof info.note === 'string' ? info.note : null,
          createdAt: String(info.createdAt ?? ''),
          state: typeof info.state === 'string' ? info.state : 'unknown',
        });
      }
    }
    sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    archived.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return {
      id: project.id,
      name: project.name,
      path: project.path,
      missing: Boolean(project.missing),
      count: sessionsLabel(sessions.length),
      expanded: !ui.collapsed.has(project.id),
      sessions,
      archived,
    };
  });
}

/**
 * @typedef {object} Indicator
 * @property {string} id
 * @property {string} label
 * @property {boolean} ok
 * @property {string} title Tooltip with the reason.
 */

/**
 * Connection indicators of the sidebar foot: service, ChatGPT, Claude, iPad.
 * @param {Record<string, unknown>} state
 * @param {boolean} linked The last poll of /api/state succeeded.
 * @returns {Indicator[]}
 */
export function indicators(state, linked) {
  const providers = Array.isArray(record(state['providers'])['providers']) ? record(state['providers'])['providers'] : [];
  /** @type {Indicator[]} */
  const list = [{ id: 'service', label: 'Служба', ok: linked, title: linked ? 'Служба отвечает' : 'Нет связи со службой' }];
  for (const id of ['codex', 'claude']) {
    const status = record(providers.find((/** @type {any} */ p) => p.id === id)?.status);
    const ok = linked && status['state'] === 'ready';
    list.push({ id, label: providerLabel(id), ok, title: typeof status['label'] === 'string' ? status['label'] : 'нет сведений' });
  }
  const addresses = record(state['system'])['addresses'];
  const remote = (Array.isArray(addresses) ? addresses : []).filter((a) => typeof a === 'string' && !a.includes('127.0.0.1'));
  list.push({ id: 'ipad', label: 'iPad · Tailscale', ok: linked && remote.length > 0, title: remote.length > 0 ? remote.join(', ') : 'Адреса Tailscale нет' });
  return list;
}

/**
 * The status line of the current preparation (a running setup), or null.
 * @param {Record<string, unknown>} state
 * @param {number} now
 * @returns {{ text: string, elapsed: string } | null}
 */
export function statusLine(state, now) {
  const runs = Array.isArray(record(state['setup'])['runs']) ? record(state['setup'])['runs'] : [];
  const run = runs.find((/** @type {any} */ r) => r.status === 'running');
  if (!run) return null;
  const started = Date.parse(run.startedAt);
  return {
    text: `Готовим сессию в ${providerLabel(run.provider)}`,
    elapsed: Number.isFinite(started) ? formatElapsed(now - started) : '',
  };
}

/**
 * Session link for this device: mobile on touch devices, desktop otherwise, web as a fallback
 * (same order as provider-cards pickSessionLink). Script-like schemes are refused.
 * @param {Record<string, unknown>} links
 * @param {number} maxTouchPoints
 * @returns {string | null}
 */
export function deviceLink(links, maxTouchPoints) {
  const order = maxTouchPoints > 1 ? ['mobile', 'web'] : ['desktop', 'web'];
  for (const kind of order) {
    const value = links[kind];
    if (typeof value !== 'string') continue;
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value)?.[1]?.toLowerCase();
    if (scheme && !['javascript', 'data', 'file', 'vbscript', 'blob'].includes(scheme)) return value;
  }
  return null;
}

/**
 * Header line of a session whose chat opens from its card (ChatGPT) instead of «Открыть чат».
 * @param {{ note?: string | null }} session
 * @param {string | null} link the chat link for this device
 * @returns {{ text: string, tone: 'muted' }}
 */
export function chatStatus(session, link) {
  return { text: link ? 'чат открывается щелчком по карточке сессии' : (session.note ?? 'ссылки нет'), tone: 'muted' };
}

/**
 * Theme attribute for the root element: undefined follows the system.
 * @param {string | null} saved
 * @returns {'light' | 'dark' | undefined}
 */
export function themeAttribute(saved) {
  return saved === 'light' || saved === 'dark' ? saved : undefined;
}
