// @ts-check
// Pure view logic of the provider cards. Everything is derived from the provider contract and the
// "operations" section of /api/state; there is no code for a particular provider. No DOM here:
// the functions are tested with node --test.

/** @typedef {import('#provider-registry').Capabilities} Capabilities */
/** @typedef {import('#provider-registry').HookEntry} HookEntry */
/** @typedef {import('#provider-registry').HookState} HookState */
/** @typedef {import('#provider-registry').ProviderErrorInfo} ProviderErrorInfo */
/** @typedef {import('#provider-registry').SessionLinks} SessionLinks */
/** @typedef {import('#provider-registry').TrustPreview} TrustPreview */
/** @typedef {import('#provider-registry').TrustState} TrustState */
/** @typedef {import('#data-store').Operation} Operation */
/** @typedef {import('#data-store').OperationError} OperationError */
/** @typedef {'ok' | 'warn' | 'error' | 'muted'} Tone */

/** Tone of the provider status pill by ProviderStatus.state. */
/** @type {Readonly<Record<string, Tone>>} */
export const STATUS_TONES = {
  ready: 'ok',
  'not-implemented': 'muted',
  'not-installed': 'warn',
  unavailable: 'warn',
  error: 'error',
  unknown: 'muted',
};

/**
 * @param {string | undefined} state
 * @returns {Tone}
 */
export function statusTone(state) {
  return (state && STATUS_TONES[state]) || 'muted';
}

/** Names of the common capabilities shown to the user; a provider's own names are shown as is. */
/** @type {Readonly<Record<string, string>>} */
export const CAPABILITY_NAMES = {
  trust: 'доверие к папке',
  hooks: 'хуки',
  sessions: 'список сессий',
  createSession: 'создание сессии',
  resumeSession: 'возобновление сессии',
  stopSession: 'остановка сессии',
  environment: 'окружение папки',
  daemon: 'демон',
};

/**
 * @param {string} name
 * @returns {string}
 */
export function capabilityName(name) {
  return CAPABILITY_NAMES[name] ?? name;
}

/**
 * Whether a control backed by a capability is shown and enabled.
 * @typedef {{ shown: boolean, enabled: boolean, reason: string | null }} Gate
 */

/**
 * A capability that is not reported is assumed available, unless it is optional (an optional
 * contract method such as resumeSession): then its control is hidden.
 * @param {Capabilities | null | undefined} capabilities
 * @param {string} name
 * @param {boolean} [optional]
 * @returns {Gate}
 */
export function capabilityGate(capabilities, name, optional = false) {
  const capability = capabilities ? capabilities[name] : undefined;
  if (!capability) return optional ? { shown: false, enabled: false, reason: null } : { shown: true, enabled: true, reason: null };
  if (capability.available) return { shown: true, enabled: true, reason: null };
  return { shown: true, enabled: false, reason: capability.reason || 'недоступно' };
}

/**
 * Unavailable capabilities with their reasons (D4).
 * @param {Capabilities | null | undefined} capabilities
 * @returns {Array<{ name: string, label: string, reason: string }>}
 */
export function unavailableCapabilities(capabilities) {
  return Object.entries(capabilities ?? {})
    .filter(([, capability]) => !capability.available)
    .map(([name, capability]) => ({ name, label: capabilityName(name), reason: capability.reason || 'недоступно' }));
}

/** Schemes a session link may never use. */
const BLOCKED_SCHEMES = new Set(['javascript:', 'data:', 'vbscript:', 'file:', 'blob:', 'about:']);

/**
 * Validates a link: an absolute URL with a scheme other than javascript:, data: and the like.
 * App deep links (claude://…) are allowed; web says whether it is http(s).
 * @param {unknown} url
 * @returns {{ href: string, web: boolean } | null}
 */
export function safeLink(url) {
  if (typeof url !== 'string' || url.trim() === '') return null;
  let parsed;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (BLOCKED_SCHEMES.has(parsed.protocol)) return null;
  return { href: url.trim(), web: parsed.protocol === 'http:' || parsed.protocol === 'https:' };
}

/**
 * True on touch devices; iPad Safari reports itself as a Mac, so maxTouchPoints is the signal.
 * @param {number | undefined} maxTouchPoints
 * @returns {boolean}
 */
export function isTouchDevice(maxTouchPoints) {
  return typeof maxTouchPoints === 'number' && maxTouchPoints > 1;
}

/** @typedef {{ kind: 'desktop' | 'mobile' | 'web', href: string, web: boolean }} ChosenLink */

/**
 * Picks the session link for this device: mobile when maxTouchPoints > 1, otherwise desktop;
 * web is the fallback. Unsafe links are skipped.
 * @param {SessionLinks | null | undefined} links
 * @param {number | undefined} maxTouchPoints
 * @returns {ChosenLink | null}
 */
export function pickSessionLink(links, maxTouchPoints) {
  /** @type {Array<'desktop' | 'mobile' | 'web'>} */
  const order = isTouchDevice(maxTouchPoints) ? ['mobile', 'web'] : ['desktop', 'web'];
  for (const kind of order) {
    const link = safeLink(links ? links[kind] : undefined);
    if (link) return { kind, href: link.href, web: link.web };
  }
  return null;
}

/**
 * Which operations a control waits for: kind, provider, project and extra scope fields.
 * provider and project are not compared when undefined (e.g. the global providers.refresh).
 * @typedef {{ kind: string, provider?: string, project?: string | null, scope?: Record<string, string> }} OperationMatch
 */

/**
 * @param {Operation} operation
 * @param {OperationMatch} match
 * @returns {boolean}
 */
export function matchesOperation(operation, match) {
  if (operation.kind !== match.kind) return false;
  const scope = operation.scope ?? {};
  if (match.provider !== undefined && (scope['provider'] ?? null) !== match.provider) return false;
  if (match.project !== undefined && (scope['project'] ?? null) !== match.project) return false;
  return Object.entries(match.scope ?? {}).every(([key, value]) => scope[key] === value);
}

/**
 * Stable string key of a match; used to remember requests that are being sent.
 * @param {OperationMatch} match
 * @returns {string}
 */
export function operationKey(match) {
  const extra = Object.entries(match.scope ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`);
  return [match.kind, match.provider ?? '*', match.project === undefined ? '*' : match.project ?? '-', ...extra].join('|');
}

/**
 * The running operation of a control and its latest failure (unless dismissed or followed by a
 * newer finished one).
 * @param {readonly Operation[]} operations
 * @param {OperationMatch} match
 * @param {readonly string[]} [dismissed] ids of failures the user hid
 * @returns {{ running: Operation | null, failed: Operation | null }}
 */
export function operationState(operations, match, dismissed = []) {
  const mine = operations.filter((op) => matchesOperation(op, match));
  const running = mine.find((op) => op.status === 'running') ?? null;
  const finished = mine
    .filter((op) => op.status !== 'running')
    .sort((a, b) => String(b.finishedAt ?? b.startedAt).localeCompare(String(a.finishedAt ?? a.startedAt)));
  const latest = finished[0];
  const failed = !running && latest && latest.status === 'failed' && !dismissed.includes(latest.id) ? latest : null;
  return { running, failed };
}

/** @typedef {{ code: string, message: string, hint: string | null }} ErrorView */

/**
 * State of one action button.
 * @typedef {object} ButtonView
 * @property {boolean} shown
 * @property {boolean} disabled
 * @property {boolean} busy An operation runs or the request is being sent.
 * @property {string | null} reason Why the button is disabled (capability or action reason).
 * @property {string | null} progress Progress text while busy.
 * @property {ErrorView | null} error Error of the latest failed operation.
 * @property {string | null} failedId Id of that operation (to dismiss it).
 */

/**
 * @param {OperationError | ProviderErrorInfo | null | undefined} error
 * @returns {ErrorView | null}
 */
export function errorView(error) {
  if (!error) return null;
  return { code: String(error.code ?? 'internal'), message: String(error.message ?? ''), hint: typeof error.hint === 'string' ? error.hint : null };
}

/**
 * Combines a gate, the operations of the control and a request in flight.
 * @param {{ gate?: Gate, operations: readonly Operation[], match: OperationMatch, sending?: readonly string[], dismissed?: readonly string[] }} input
 * @returns {ButtonView}
 */
export function buttonView(input) {
  const gate = input.gate ?? { shown: true, enabled: true, reason: null };
  const state = operationState(input.operations, input.match, input.dismissed);
  const sending = (input.sending ?? []).includes(operationKey(input.match));
  const busy = sending || state.running !== null;
  let progress = null;
  if (state.running) progress = state.running.progress || 'выполняется…';
  else if (sending) progress = 'отправка…';
  return {
    shown: gate.shown,
    disabled: !gate.enabled || busy,
    busy,
    reason: gate.enabled ? null : gate.reason,
    progress,
    error: errorView(state.failed?.error),
    failedId: state.failed ? state.failed.id : null,
  };
}

/** Hook approval states. */
/** @type {Readonly<Record<string, { label: string, tone: Tone }>>} */
export const HOOK_STATUS = {
  approved: { label: 'одобрен', tone: 'ok' },
  pending: { label: 'ждёт одобрения', tone: 'warn' },
  modified: { label: 'изменён', tone: 'error' },
  unknown: { label: 'неизвестно', tone: 'muted' },
};

/**
 * @param {string} hash
 * @returns {string}
 */
export function shortHash(hash) {
  const bare = String(hash ?? '').replace(/^sha256:/i, '');
  return bare.length > 12 ? `${bare.slice(0, 12)}…` : bare;
}

/**
 * @typedef {object} HookRow
 * @property {string} command
 * @property {string} hash
 * @property {string} shortHash
 * @property {boolean} kit
 * @property {string} status
 * @property {string} label
 * @property {Tone} tone
 * @property {string | null} key
 * @property {boolean} approvable Only a Kit hook that is not approved yet can be approved.
 */

/**
 * Hook rows: the Kit hook first, then the others; repeats of the same entry are dropped.
 * @param {HookState | null | undefined} hooks
 * @returns {HookRow[]}
 */
export function hookRows(hooks) {
  if (!hooks) return [];
  /** @type {HookEntry[]} */
  const entries = [];
  const seen = new Set();
  for (const entry of [...(hooks.kitHook ? [hooks.kitHook] : []), ...(hooks.hooks ?? [])]) {
    const id = `${entry.kit}|${entry.key ?? ''}|${entry.command}|${entry.hash}`;
    if (seen.has(id)) continue;
    seen.add(id);
    entries.push(entry);
  }
  return entries.map((entry) => {
    const status = HOOK_STATUS[entry.status] ?? { label: String(entry.status), tone: /** @type {Tone} */ ('muted') };
    return {
      command: entry.command,
      hash: entry.hash,
      shortHash: shortHash(entry.hash),
      kit: entry.kit,
      status: entry.status,
      label: status.label,
      tone: status.tone,
      key: entry.key ?? null,
      approvable: entry.kit && entry.status !== 'approved',
    };
  });
}

/**
 * @param {TrustState | null | undefined} trust
 * @returns {{ label: string, tone: Tone, note: string | null, backup: string | null }}
 */
export function trustView(trust) {
  const note = trust?.note ?? null;
  const backup = trust?.backup ?? null;
  if (trust?.trusted === true) return { label: 'доверено', tone: 'ok', note, backup };
  if (trust?.trusted === false) return { label: 'нет доверия', tone: 'warn', note, backup };
  return { label: 'неизвестно', tone: 'muted', note, backup };
}

/**
 * @param {TrustPreview} preview
 * @param {number} nowMs
 * @returns {boolean}
 */
export function previewExpired(preview, nowMs) {
  const expires = Date.parse(preview.expiresAt);
  return Number.isFinite(expires) && expires <= nowMs;
}

/** Session states and origins. */
/** @type {Readonly<Record<string, { label: string, tone: Tone }>>} */
export const SESSION_STATES = {
  running: { label: 'работает', tone: 'ok' },
  stopped: { label: 'остановлена', tone: 'muted' },
  unknown: { label: 'состояние неизвестно', tone: 'muted' },
};

/** @type {Readonly<Record<string, string>>} */
export const SESSION_ORIGINS = { panel: 'из панели', hook: 'из приложения' };

/**
 * Formats provider details (e.g. { daemon: { running, pid } }) as label/value rows; nested
 * objects are flattened one level ("daemon.running").
 * @param {Record<string, unknown> | null | undefined} details
 * @param {string} [prefix]
 * @returns {Array<[string, string]>}
 */
export function detailRows(details, prefix = '') {
  /** @type {Array<[string, string]>} */
  const rows = [];
  for (const [key, value] of Object.entries(details ?? {})) {
    const label = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value) && !prefix) {
      rows.push(...detailRows(/** @type {Record<string, unknown>} */ (value), label));
    } else {
      rows.push([label, formatValue(value)]);
    }
  }
  return rows;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function formatValue(value) {
  if (value === null || value === undefined) return '—';
  if (value === true) return 'да';
  if (value === false) return 'нет';
  if (Array.isArray(value)) return value.map(formatValue).join(', ') || '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Names of the reads in ProviderSummary.errors and ProjectProviderState.errors. */
/** @type {Readonly<Record<string, string>>} */
export const READ_NAMES = {
  status: 'статус',
  capabilities: 'возможности',
  actions: 'действия',
  trust: 'доверие',
  hooks: 'хуки',
  sessions: 'сессии',
};

/**
 * @param {Record<string, ProviderErrorInfo> | null | undefined} errors
 * @returns {Array<{ name: string, label: string, code: string, message: string, hint: string | null }>}
 */
export function readErrors(errors) {
  return Object.entries(errors ?? {}).map(([name, error]) => ({
    name,
    label: READ_NAMES[name] ?? name,
    ...(/** @type {ErrorView} */ (errorView(error))),
  }));
}

/**
 * The project shown in the provider cards: the preferred one when it is still listed, otherwise
 * the first project whose folder exists, otherwise the first one.
 * @param {ReadonlyArray<{ id: string, missing?: boolean }>} projects
 * @param {string | null | undefined} preferredId
 * @returns {string | null}
 */
export function chooseProject(projects, preferredId) {
  if (preferredId && projects.some((p) => p.id === preferredId)) return preferredId;
  return (projects.find((p) => !p.missing) ?? projects[0])?.id ?? null;
}
