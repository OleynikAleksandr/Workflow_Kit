// @ts-check
// Panel extension: one card per registered provider, drawn only from the provider contract
// (/api/state sections "providers", "projects" and "operations"). Loaded by the panel shell, which
// calls install(shell) with its helpers; nothing here knows a particular provider.
import { cardModel, MATCHES, providerRoutes } from './card-model.js';
import { chooseProject, operationKey } from './model.js';
import { renderCard } from './render.js';

/** @typedef {import('#provider-registry').ProvidersSection} ProvidersSection */
/** @typedef {import('#provider-registry').TrustPreview} TrustPreview */
/** @typedef {import('#data-store').Operation} Operation */
/** @typedef {import('./card-model.js').CardMessage} CardMessage */
/** @typedef {import('./card-model.js').CardModel} CardModel */
/** @typedef {import('./model.js').OperationMatch} OperationMatch */
/** @typedef {import('./render.js').CardHandlers} CardHandlers */
/** @typedef {import('./render.js').Dom} Dom */

/**
 * Helpers the panel shell injects (panel-shell app.js).
 * @typedef {object} Shell
 * @property {typeof import('../../panel-shell/src/cards.js').registerCardGroup} registerCardGroup
 * @property {typeof import('../../panel-shell/src/cards.js').requestRefresh} requestRefresh
 * @property {typeof import('../../panel-shell/src/api.js').api} api
 * @property {typeof import('../../panel-shell/src/api.js').ApiError} ApiError
 * @property {Dom} dom
 */

/** Card group id and order in the panel (after "Система", "Проекты", "Структура Kit"). */
export const GROUP_ID = 'provider';
export const GROUP_ORDER = 30;
/** localStorage key of the project shown in the provider cards. */
const PROJECT_KEY = 'wfk.provider-cards.project';

/**
 * @typedef {object} LocalUi
 * @property {Set<string>} sending
 * @property {Set<string>} dismissed
 * @property {{ projectId: string, data: TrustPreview, choices: Record<string, string> } | null} preview The open trust preview and the answers to its choices.
 * @property {CardMessage | null} message
 */

/** @returns {string | null} */
function readStoredProject() {
  try {
    return window.localStorage.getItem(PROJECT_KEY);
  } catch {
    return null;
  }
}

/** @param {string} id */
function storeProject(id) {
  try {
    window.localStorage.setItem(PROJECT_KEY, id);
  } catch {
    // Private mode or blocked storage: the choice lives until the page reloads.
  }
}

/**
 * Registers the provider card group.
 * @param {Shell} shell
 */
export function install(shell) {
  const { api, ApiError, requestRefresh } = shell;
  /** @type {Map<string, LocalUi>} */
  const uis = new Map();
  let preferredProject = readStoredProject();

  /** @param {string} id */
  function uiOf(id) {
    let ui = uis.get(id);
    if (!ui) {
      ui = { sending: new Set(), dismissed: new Set(), preview: null, message: null };
      uis.set(id, ui);
    }
    return ui;
  }

  /**
   * @param {unknown} error
   * @returns {CardMessage}
   */
  function errorMessage(error) {
    if (error instanceof ApiError) {
      const extra = error.blockers.length > 0 ? ` (${error.blockers.join('; ')})` : '';
      return { tone: 'error', text: `${error.message}${extra}`, hint: error.hint ?? null };
    }
    return { tone: 'error', text: error instanceof Error ? error.message : String(error) };
  }

  /**
   * Sends one request of a control; the control shows "отправка…" until the answer, then the
   * operation (202) or the error.
   * @param {string} providerId
   * @param {OperationMatch} match
   * @param {() => Promise<void>} run
   */
  async function send(providerId, match, run) {
    const ui = uiOf(providerId);
    const key = operationKey(match);
    if (ui.sending.has(key)) return;
    ui.sending.add(key);
    ui.message = null;
    requestRefresh();
    try {
      await run();
    } catch (error) {
      ui.message = errorMessage(error);
    } finally {
      ui.sending.delete(key);
      requestRefresh();
    }
  }

  /**
   * @param {string} providerId
   * @param {string | null} projectId
   * @returns {CardHandlers}
   */
  function handlers(providerId, projectId) {
    const ui = uiOf(providerId);
    const routes = providerRoutes(providerId);
    const project = projectId === null ? null : routes.project(projectId);
    const noop = () => undefined;
    return {
      selectProject(id) {
        preferredProject = id;
        storeProject(id);
        for (const other of uis.values()) {
          other.preview = null;
          other.message = null;
        }
        requestRefresh();
      },
      refresh: () => void send(providerId, MATCHES.refresh(), async () => void (await api('POST', routes.refresh))),
      runAction(action, scopeProject) {
        if (action.confirm && !window.confirm(action.confirm)) return;
        const url = scopeProject === null ? routes.action(action.id) : routes.project(scopeProject).action(action.id);
        void send(providerId, MATCHES.action(providerId, scopeProject, action.id), async () => void (await api('POST', url)));
      },
      preview: !project || projectId === null ? noop : () =>
        void send(providerId, MATCHES.preview(providerId, projectId), async () => {
          // A new preview starts without answers: the choices have no default.
          ui.preview = { projectId, data: /** @type {TrustPreview} */ (await api('GET', project.preview)), choices: {} };
        }),
      cancelPreview() {
        ui.preview = null;
        requestRefresh();
      },
      choose(choiceId, optionId) {
        if (!ui.preview) return;
        ui.preview.choices = { ...ui.preview.choices, [choiceId]: optionId };
        requestRefresh();
      },
      grant: !project || projectId === null ? noop : (token, choices) =>
        void send(providerId, MATCHES.trust(providerId, projectId), async () => {
          await api('POST', project.trust, { token, choices });
          ui.preview = null;
        }),
      approve: !project || projectId === null ? noop : (row) => {
        const question = `Одобрить хук Kit?\n\nКоманда: ${row.command}\nХеш: ${row.hash}`;
        if (!window.confirm(question)) return;
        void send(providerId, MATCHES.approve(providerId, projectId), async () => void (await api('POST', project.approve, { command: row.command, hash: row.hash })));
      },
      createSession: !project || projectId === null ? noop : () =>
        void send(providerId, MATCHES.create(providerId, projectId), async () => void (await api('POST', project.sessions, {}))),
      session: !project || projectId === null ? noop : (session, verb) => {
        if (verb === 'stop' && !window.confirm(`Остановить сессию «${session.title}»?`)) return;
        void send(providerId, MATCHES.session(providerId, projectId, verb, session.id), async () => void (await api('POST', project.session(session.id, verb))));
      },
      dismiss(operationId) {
        ui.dismissed.add(operationId);
        requestRefresh();
      },
      clearMessage() {
        ui.message = null;
        requestRefresh();
      },
    };
  }

  /**
   * @param {Record<string, unknown>} state
   * @returns {ProvidersSection | null}
   */
  function providersOf(state) {
    const section = /** @type {ProvidersSection | undefined} */ (state['providers']);
    return section && Array.isArray(section.providers) ? section : null;
  }

  shell.registerCardGroup({
    id: GROUP_ID,
    order: GROUP_ORDER,
    items: (state) => (providersOf(state)?.providers ?? []).map((p) => ({ id: p.id, title: p.title })),
    select(state, providerId) {
      const section = providersOf(state);
      const provider = section?.providers.find((p) => p.id === providerId);
      if (!section || !provider) return null;
      const projectsSection = /** @type {{ projects?: Array<{ id: string, name: string, path: string, missing?: boolean }> } | undefined} */ (state['projects']);
      const projects = projectsSection?.projects ?? [];
      const projectId = chooseProject(projects, preferredProject);
      const operationsSection = /** @type {{ operations?: Operation[] } | undefined} */ (state['operations']);
      const operations = (operationsSection?.operations ?? []).filter((op) => op.kind === 'providers.refresh' || op.scope?.['provider'] === providerId);
      const ui = uiOf(providerId);
      const shown = ui.preview && ui.preview.projectId === projectId ? ui.preview : null;
      return cardModel({
        provider,
        projects,
        projectId,
        project: projectId === null ? null : (section.projects[projectId]?.[providerId] ?? null),
        operations,
        ui: { sending: [...ui.sending], dismissed: [...ui.dismissed], preview: shown?.data ?? null, choices: shown?.choices ?? {}, message: ui.message },
        maxTouchPoints: typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints,
        nowMs: Date.now(),
      });
    },
    /**
     * @param {CardModel | null} model
     * @param {Record<string, unknown>} _state
     * @param {string} providerId
     */
    render(model, _state, providerId) {
      if (!model) return shell.dom.h('p', { class: 'muted' }, ['Провайдер не найден в состоянии.']);
      return renderCard(model, shell.dom, handlers(providerId, model.projects.selectedId));
    },
  });
}
