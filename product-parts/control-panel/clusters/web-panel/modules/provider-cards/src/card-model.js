// @ts-check
// View model of one provider card, built only from the provider contract (ProviderSummary,
// ProjectProviderState), the "operations" section and the card's local UI state. Pure: no DOM.
import {
  buttonView,
  capabilityGate,
  hookRows,
  pickSessionLink,
  previewExpired,
  readErrors,
  SESSION_ORIGINS,
  SESSION_STATES,
  statusTone,
  trustView,
  unavailableCapabilities,
  detailRows,
} from './model.js';

/** @typedef {import('#provider-registry').ProviderSummary} ProviderSummary */
/** @typedef {import('#provider-registry').ProjectProviderState} ProjectProviderState */
/** @typedef {import('#provider-registry').ProviderAction} ProviderAction */
/** @typedef {import('#provider-registry').SessionInfo} SessionInfo */
/** @typedef {import('#provider-registry').TrustPreview} TrustPreview */
/** @typedef {import('#data-store').Operation} Operation */
/** @typedef {import('./model.js').ButtonView} ButtonView */
/** @typedef {import('./model.js').OperationMatch} OperationMatch */
/** @typedef {import('./model.js').Tone} Tone */

/** Operations a provider card waits for (kinds of the provider-registry routes). */
export const MATCHES = {
  refresh: () => /** @type {OperationMatch} */ ({ kind: 'providers.refresh' }),
  /** Local only: GET trust/preview in flight. */
  preview: (/** @type {string} */ provider, /** @type {string} */ project) => ({ kind: 'trust.preview', provider, project }),
  trust: (/** @type {string} */ provider, /** @type {string} */ project) => ({ kind: 'provider.trust', provider, project }),
  approve: (/** @type {string} */ provider, /** @type {string} */ project) => ({ kind: 'provider.hooks.approve', provider, project }),
  create: (/** @type {string} */ provider, /** @type {string} */ project) => ({ kind: 'provider.session.create', provider, project }),
  /**
   * @param {string} provider
   * @param {string} project
   * @param {'resume' | 'stop'} verb
   * @param {string} session
   * @returns {OperationMatch}
   */
  session: (provider, project, verb, session) => ({ kind: `provider.session.${verb}`, provider, project, scope: { session } }),
  /**
   * @param {string} provider
   * @param {string | null} project null for a provider-scope action
   * @param {string} action
   * @returns {OperationMatch}
   */
  action: (provider, project, action) => ({ kind: 'provider.action', provider, project, scope: { action } }),
};

/**
 * URLs of the provider routes (spec section 10).
 * @param {string} providerId
 * @returns {{ refresh: string, action: (actionId: string) => string, project: (projectId: string) => ProjectRoutes }}
 */
export function providerRoutes(providerId) {
  const p = encodeURIComponent(providerId);
  return {
    refresh: '/api/refresh',
    action: (actionId) => `/api/providers/${p}/actions/${encodeURIComponent(actionId)}`,
    project: (projectId) => {
      const base = `/api/projects/${encodeURIComponent(projectId)}/providers/${p}`;
      return {
        preview: `${base}/trust/preview`,
        trust: `${base}/trust`,
        approve: `${base}/hooks/approve`,
        sessions: `${base}/sessions`,
        session: (sid, verb) => `${base}/sessions/${encodeURIComponent(sid)}/${verb}`,
        action: (actionId) => `${base}/actions/${encodeURIComponent(actionId)}`,
      };
    },
  };
}

/**
 * @typedef {object} ProjectRoutes
 * @property {string} preview
 * @property {string} trust
 * @property {string} approve
 * @property {string} sessions
 * @property {(sid: string, verb: 'resume' | 'stop') => string} session
 * @property {(actionId: string) => string} action
 */

/** @typedef {{ tone: 'ok' | 'error' | 'muted', text: string, hint?: string | null }} CardMessage */

/**
 * Local UI state of a card (kept by provider-cards.js between polls).
 * @typedef {object} CardUi
 * @property {string[]} sending Keys (operationKey) of requests being sent.
 * @property {string[]} dismissed Ids of failed operations the user hid.
 * @property {TrustPreview | null} preview Trust preview of the selected project.
 * @property {CardMessage | null} message Last message of a synchronous request.
 */

/**
 * @typedef {object} CardInput
 * @property {ProviderSummary} provider
 * @property {ReadonlyArray<{ id: string, name: string, path: string, missing?: boolean }>} projects
 * @property {string | null} projectId Selected project.
 * @property {ProjectProviderState | null} project State of the selected project for this provider.
 * @property {readonly Operation[]} operations
 * @property {CardUi} ui
 * @property {number | undefined} maxTouchPoints
 * @property {number} nowMs
 */

/**
 * @param {readonly ProviderAction[]} actions
 * @param {'provider' | 'project'} scope
 * @param {(action: ProviderAction) => ButtonView} button
 */
function actionList(actions, scope, button) {
  return actions
    .filter((action) => action.scope === scope)
    .map((action) => ({ id: action.id, title: action.title, confirm: action.confirm ?? null, button: button(action) }));
}

/**
 * Builds the view model of a provider card.
 * @param {CardInput} input
 */
export function cardModel(input) {
  const { provider, ui, operations } = input;
  const caps = provider.capabilities;
  const id = provider.id;
  const common = { operations, sending: ui.sending, dismissed: ui.dismissed };
  const status = provider.status;
  /** @param {ProviderAction} action @param {string | null} projectId */
  const actionButton = (action, projectId) =>
    buttonView({
      ...common,
      gate: { shown: true, enabled: action.enabled, reason: action.enabled ? null : action.reason || 'недоступно' },
      match: MATCHES.action(id, projectId, action.id),
    });
  const selected = input.projects.find((p) => p.id === input.projectId) ?? null;

  return {
    id,
    title: provider.title,
    status: {
      state: status?.state ?? 'unknown',
      label: status?.label ?? 'нет данных',
      tone: statusTone(status?.state),
      implemented: status?.implemented ?? false,
      installed: status?.installed ?? null,
      version: status?.version ?? null,
      path: status?.path ?? null,
      note: status?.note ?? null,
      checkedAt: status?.checkedAt ?? null,
      details: detailRows(status?.details),
    },
    unavailable: unavailableCapabilities(caps),
    errors: readErrors(provider.errors),
    refresh: buttonView({ ...common, match: MATCHES.refresh() }),
    actions: actionList(provider.actions, 'provider', (action) => actionButton(action, null)),
    message: ui.message,
    projects: { list: input.projects.map((p) => ({ id: p.id, name: p.name })), selectedId: selected?.id ?? null },
    project: selected ? projectModel(input, selected, actionButton) : null,
  };
}

/**
 * @param {CardInput} input
 * @param {{ id: string, name: string, path: string, missing?: boolean }} selected
 * @param {(action: ProviderAction, projectId: string | null) => ButtonView} actionButton
 */
function projectModel(input, selected, actionButton) {
  const { provider, ui, operations } = input;
  const caps = provider.capabilities;
  const id = provider.id;
  const state = input.project;
  const common = { operations, sending: ui.sending, dismissed: ui.dismissed };
  const trustGate = capabilityGate(caps, 'trust');
  const hooksGate = capabilityGate(caps, 'hooks');
  const preview = ui.preview && ui.preview.provider === id ? ui.preview : null;
  const approve = buttonView({ ...common, gate: hooksGate, match: MATCHES.approve(id, selected.id) });

  return {
    id: selected.id,
    name: selected.name,
    path: selected.path,
    missing: selected.missing === true,
    loaded: state !== null,
    errors: readErrors(state?.errors),
    trust: {
      ...trustView(state?.trust),
      preview: buttonView({ ...common, gate: trustGate, match: MATCHES.preview(id, selected.id) }),
      grant: buttonView({ ...common, gate: trustGate, match: MATCHES.trust(id, selected.id) }),
      previewData: preview
        ? {
            trusted: preview.trusted,
            writes: preview.writes,
            autorun: preview.autorun,
            notes: preview.notes ?? [],
            token: preview.token,
            expiresAt: preview.expiresAt,
            expired: previewExpired(preview, input.nowMs),
          }
        : null,
    },
    hooks: {
      gate: hooksGate,
      rows: hookRows(state?.hooks).map((row) => ({ ...row, approve: row.approvable ? approve : null })),
      incomplete: state?.hooks?.complete === false,
      note: state?.hooks?.note ?? null,
    },
    sessions: {
      gate: capabilityGate(caps, 'sessions'),
      create: buttonView({ ...common, gate: capabilityGate(caps, 'createSession'), match: MATCHES.create(id, selected.id) }),
      list: (state?.sessions ?? []).map((session) => sessionModel(input, selected.id, session)),
    },
    actions: actionList(state?.actions ?? [], 'project', (action) => actionButton(action, selected.id)),
  };
}

/**
 * @param {CardInput} input
 * @param {string} projectId
 * @param {SessionInfo} session
 */
function sessionModel(input, projectId, session) {
  const { provider, ui, operations } = input;
  const caps = provider.capabilities;
  const common = { operations, sending: ui.sending, dismissed: ui.dismissed };
  const link = pickSessionLink(session.links, input.maxTouchPoints);
  const hasAnyLink = Object.values(session.links ?? {}).some((value) => typeof value === 'string' && value !== '');
  const state = SESSION_STATES[session.state] ?? SESSION_STATES['unknown'] ?? { label: session.state, tone: 'muted' };
  const running = session.state === 'running';
  // Per-session controls appear only when available; an unavailable one is listed with its reason
  // in the card's "Недоступно" block instead of a disabled button on every session.
  const resumeGate = capabilityGate(caps, 'resumeSession', true);
  const stopGate = capabilityGate(caps, 'stopSession', true);
  let note = session.note ?? null;
  if (!link && !note) note = hasAnyLink ? 'нет ссылки для этого устройства' : 'ссылки нет';
  return {
    id: session.localId,
    remoteId: session.remoteId ?? null,
    title: session.title || session.localId,
    createdAt: session.createdAt,
    model: session.model ?? null,
    origin: SESSION_ORIGINS[session.origin] ?? session.origin,
    state: { label: state.label, tone: /** @type {Tone} */ (state.tone) },
    link,
    note,
    resume: buttonView({ ...common, gate: { ...resumeGate, shown: resumeGate.enabled && !running }, match: MATCHES.session(provider.id, projectId, 'resume', session.localId) }),
    stop: buttonView({ ...common, gate: { ...stopGate, shown: stopGate.enabled && running }, match: MATCHES.session(provider.id, projectId, 'stop', session.localId) }),
  };
}

/** @typedef {ReturnType<typeof cardModel>} CardModel */
/** @typedef {NonNullable<CardModel['project']>} ProjectModel */
/** @typedef {ReturnType<typeof sessionModel>} SessionModel */
