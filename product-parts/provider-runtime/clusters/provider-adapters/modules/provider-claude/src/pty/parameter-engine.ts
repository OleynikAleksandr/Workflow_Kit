// One native transaction. The engine proposes keys; the host rechecks the screen revision before writing.
import { folderKey } from '../folder-key.ts';
import { randomUUID } from 'node:crypto';
import type { TerminalScreen } from '#pty-host';
import { freshAck, parameterFrame, sessionAcks } from './parameter-screen.ts';
import type { ParameterFrame, ModelRow } from './parameter-screen.ts';
import { DRAFT_REASON, EFFORTS, FAST_REASON, MODES, UNSAFE_REASON, supportedNativeVersion, validNativeRequest } from './parameter-protocol.ts';
import type { TurnState } from './turn-file.ts';
import type { NativeAction, NativeCatalog, NativeEfforts, NativeMetadata, NativeParameterRequest, NativeParameterResult, NativeParameterState, NativeWanted, WantedField } from './parameter-protocol.ts';
import { WantedChoices } from './parameter-wanted.ts';
import { CatalogChanged, effortLevels, seekRow } from './parameter-menu.ts';
import type { Flow, Step } from './parameter-menu.ts';

/** The statusline cwd follows the agent's cd (M28): the session folder or a folder inside it. */
export function insideFolder(cwd: string, root: string): boolean {
  const a = folderKey(cwd).replace(/\\/g, '/'); const b = folderKey(root).replace(/\\/g, '/').replace(/\/+$/, '');
  return a === b || a.startsWith(b + '/');
}
/** Discovery of the native catalog: attempts per model and the pause between them (M28 T014). */
export const DISCOVERY_TRIES = 3; export const DISCOVERY_RETRY_MS = 30_000;
/** M45: cleanup keys after a cancel, an idle menu of the host, the pause after the user's input. */
export const CLEANUP_TRIES = 3; export const MENU_IDLE_MS = 10_000; export const INPUT_QUIET_MS = 3000;
const MENUS = new Set<string>(['model', 'effort', 'fast', 'switch']);
export class ParameterEngine {
  private revision = 0; private rendered = ''; private renderedAt = 0;
  private cancelRevision = -1; private epoch = 0; private signature = '';
  private frame: ParameterFrame;
  private meta: NativeMetadata | null = null;
  private request: NativeParameterRequest | null = null;
  private flow: Flow | null = null;
  private step: Step | null = null;
  private written = false;
  private changed = 0;
  private command: string | null = null;
  private menuOwner: { kind: ParameterFrame['kind']; submitted: boolean; seen: boolean } | null = null;
  private commandTyped = false;
  private cancelled = false;
  private seen = new Set<string>();
  private result: NativeParameterResult | null = null;
  private effectiveMode: string | null = null;
  private effectiveUltra: boolean | null = null;
  private primaryLast = 5;
  private models = new Map<string, ModelRow>();
  private recommended: string | null = null;
  private efforts: string[] = [];
  private fastReason: string | null = FAST_REASON;
  /** Efforts per model label (M29): read once per model, kept in the catalog file. */
  private effortsByModel = new Map<string, NativeEfforts>();
  private effortsLabel: string | null = null;
  /** Grows when the catalog knowledge changes; the host then rewrites the catalog file. */
  catalogRevision = 0;
  /** Wanted choices of the user (M29 3.2) and how each went. */
  readonly wanted = new WantedChoices();
  private requestWanted: { field: WantedField; id: string } | null = null;
  private cancelCause: 'user' | 'turn' | 'other' = 'other';
  private discoveryKey = '';
  private ultraAvailable = false;
  /** The catalog of the current model was read; a cancelled discovery retries (M28 T014). */
  private catalogDone = false;
  private discoveryTries = 0;
  private discoveryAt = 0;
  private unsafe = false;
  private unsafeAt = 0;
  private requestAt = 0;
  /** M45: the last command this transaction typed, cleanup keys sent, discovery keys that failed on this CLI. */
  private typed: string | null = null; private cleanups = 0; private failedKeys = new Set<string>(); private quietUntil = 0;
  private turn: TurnState | null = null;
  readonly hostId: string;
  /** M47: the build label written into the state (hostBuild); null writes none. */
  build: string | null = null;
  readonly cwd: string;
  private screen: TerminalScreen;
  private now: () => number;
  constructor(hostId: string, cwd: string, screen: TerminalScreen, now: () => number) {
    this.hostId = hostId; this.cwd = cwd; this.screen = screen; this.now = now;
    this.frame = parameterFrame(screen);
  }
  observe(metadata: NativeMetadata | null): void {
    this.meta = metadata?.hostId === this.hostId && insideFolder(metadata.cwd, this.cwd) ? metadata : null;
    // Another model: its efforts come from the catalog, or are read once (M29).
    if (this.meta && !this.request && this.meta.model.label !== this.effortsLabel) this.useModelEfforts();
    const f = parameterFrame(this.screen);
    const signature = JSON.stringify([f.kind, f.input, f.mode, f.ultracode, f.selected, f.previewEffort, this.meta?.model, this.meta?.effort]);
    if (signature !== this.signature) { this.signature = signature; this.epoch++; }
    if (f.kind === 'idle' && (f.input === '' || f.placeholder)) { this.effectiveMode = f.mode; this.effectiveUltra = f.ultracode; }
    if (this.menuOwner?.submitted) {
      if (f.kind === this.menuOwner.kind) this.menuOwner.seen = true;
      else if (this.menuOwner.seen && f.kind === 'idle') this.menuOwner = null;
    }
    this.frame = f;
    const rendered = JSON.stringify([f.text, this.screen.cursor()]);
    if (rendered !== this.rendered) { this.rendered = rendered; this.renderedAt = this.now(); this.revision++; }
  }
  userInput(): void { this.quietUntil = this.now() + INPUT_QUIET_MS; if (this.request) this.cancel('user'); }
  private useModelEfforts(): void {
    const label = this.meta?.model.label ?? null; const e = label ? this.effortsByModel.get(label) : undefined;
    this.effortsLabel = label; this.efforts = e?.values ?? []; this.recommended = e?.recommended ?? null; this.ultraAvailable = e?.ultracode ?? false;
  }
  /** The catalog file of the same CLI version replaces discovery (M29 3.2). */
  loadCatalog(catalog: NativeCatalog): boolean {
    if (this.catalogDone || this.request || !this.meta || catalog.cliVersion !== this.meta.cliVersion) return false;
    this.models = new Map(catalog.models.map(m => [m.key, { ...m, selected: false }]));
    this.primaryLast = catalog.primaryLast;
    this.effortsByModel = new Map(Object.entries(catalog.efforts));
    this.failedKeys = new Set(catalog.failed ?? []);
    this.catalogDone = this.models.size > 0;
    this.useModelEfforts();
    return this.catalogDone;
  }
  exportCatalog(): NativeCatalog | null {
    return (!this.catalogDone && !this.failedKeys.size) || !this.meta ? null : { version: 1, cliVersion: this.meta.cliVersion, primaryLast: this.primaryLast,
      models: this.catalogDone ? [...this.models.values()].map(({ key, label, group, index }) => ({ key, label, group, index })) : [],
      efforts: Object.fromEntries(this.effortsByModel), ...(this.failedKeys.size ? { failed: [...this.failedKeys] } : {}) };
  }
  private effective(field: WantedField, value: string): boolean {
    const m = this.meta; if (!m) return false;
    if (field === 'model') return m.model.label === this.models.get(value)?.label;
    if (field === 'effort') return this.snapshot().effort === value;
    if (field === 'mode') return (this.frame.mode ?? this.effectiveMode) === value;
    return (this.frame.ultracode ?? this.effectiveUltra) === (value === 'on');
  }
  /** Catalog knowledge a field needs and discovery may still bring. */
  private waitsForCatalog(field: WantedField): boolean {
    const need = field === 'model' ? !this.catalogDone : field === 'mode' ? false : !this.effortsKnown();
    return need && this.discoveryTries < DISCOVERY_TRIES && !this.failedKeys.has(this.discoveryKey);
  }
  /**
   * Applies the next wanted field on a free, empty input (M29 3.2): one transaction at a time, in
   * WANTED_ORDER; an already effective value is applied without keys.
   */
  want(value: NativeWanted | null): void { this.wanted.update(value, this.hostId, this.meta?.sessionId ?? null); }
  pursue(): void {
    // M45: a choice Claude already has is settled at once, also while the terminal is busy (no blinking).
    for (const { field, status: st } of this.wanted.open()) if (st.status === 'pending' && this.requestWanted?.field !== field && this.effective(field, st.value)) this.wanted.settle(field, 'applied', null);
    if (!this.wanted.active || this.busy || !this.ready()) return;
    for (const { field, status: st } of this.wanted.open()) {
      if (this.effective(field, st.value)) { this.wanted.settle(field, 'applied', null); continue; }
      if (this.waitsForCatalog(field)) return; // WANTED_ORDER holds: discovery goes first
      const missing = field === 'model' && !this.models.has(st.value) ? 'Этой модели нет в меню Claude'
        : field === 'effort' && !this.efforts.includes(st.value) ? 'Этого уровня усилия нет у модели'
        : field === 'ultracode' && (!this.ultraAvailable || !['on', 'off'].includes(st.value)) ? 'Ultracode недоступен для этой модели'
        : field === 'mode' && !(MODES as readonly string[]).includes(st.value) ? 'Неизвестный режим' : null;
      if (missing) { this.wanted.settle(field, 'failed', missing); continue; }
      const state = this.snapshot();
      this.begin({ version: 1, id: randomUUID(), hostId: this.hostId, sessionId: state.sessionId, epoch: state.epoch,
        expires: this.now() + 55_000, field, value: st.value }, { field, id: st.id });
      if (this.request) st.status = 'applying';
      else { this.result = null; this.wanted.count(field, 'Claude не начал изменение'); }
      return;
    }
  }
  /** Hook/interrupt turn boundaries (M28): no transaction during a turn; a turn end releases `unsafe`. */
  observeTurn(turn: TurnState | null): void {
    if (turn && this.turn && turn.at < this.turn.at) return;
    this.turn = turn;
    if (turn?.state === 'working' && this.request && turn.at >= this.requestAt) this.cancel('turn');
    if (turn?.state === 'idle' && this.unsafe && turn.at >= this.unsafeAt) this.unsafe = false;
  }
  private yieldAt = 0;
  /**
   * A user's file (.text, .message, .rename) waits for this host (M28 3.3): the transaction is
   * cancelled and gets at most 2 s to clean up (Esc, clearing its command); then the user's text goes.
   */
  yieldToUser(): boolean {
    if (this.request) {
      this.cancel('user'); if (!this.yieldAt) this.yieldAt = this.now();
      if (this.now() - this.yieldAt < 2000) return true;
      this.unsafe = !this.clean(); this.unsafeAt = this.now(); this.finish('cancelled', 'Транзакция отменена сообщением пользователя');
    }
    // M45: a cleanup that left no empty input keeps the user's text out of the menu or the typed
    // command; `unsafe` ends after 10 s (propose), then the text goes as before.
    this.yieldAt = 0; return this.unsafe && !this.clean();
  }
  private clean(): boolean { return this.frame.kind === 'idle' && this.empty(); }
  get turnWorking(): boolean { return this.turn?.state === 'working'; }
  current(): ParameterFrame { return this.frame; }
  get busy(): boolean { return this.request !== null || this.unsafe; }
  /** A transaction still owns the input (its own cleanup included); `unsafe` alone does not (M28 T012). */
  get transacting(): boolean { return this.request !== null; }
  private empty(): boolean { return this.frame.input === '' || this.frame.placeholder; }
  private ready(): boolean {
    return !!this.meta && supportedNativeVersion(this.meta.cliVersion) && this.frame.kind === 'idle' && !this.turnWorking
      && this.empty() && this.frame.mode !== null && this.now() >= this.meta.at && this.now() >= this.quietUntil;
  }
  snapshot(): NativeParameterState {
    const f = this.frame; const m = this.meta;
    const status = this.request ? 'control' : this.turnWorking ? 'busy' : !m || !supportedNativeVersion(m.cliVersion) || this.now() < m.at ? 'unknown'
      : f.kind === 'idle' && this.empty() ? 'idle' : f.kind === 'busy' ? 'busy' : f.kind === 'unknown' ? 'unknown' : 'dialog';
    return { version: 1, hostId: this.hostId, sessionId: m?.sessionId ?? '', epoch: `${this.hostId}:${this.epoch}`,
      at: this.now(), cliVersion: m?.cliVersion ?? '', status, inputEmpty: this.empty(),
      reason: status === 'idle' ? null : status === 'busy' && this.turnWorking ? 'Claude отвечает' : !m ? 'Нет native statusline этого host' : this.unsafe ? UNSAFE_REASON : !this.empty() && f.input !== null ? DRAFT_REASON : 'Терминал Claude занят или не распознан',
      model: m?.model ?? null, effort: m?.effort === 'ultra' ? f.baseEffort : m?.effort ?? null,
      mode: f.mode ?? this.effectiveMode, fast: m?.fast ?? null, ultracode: f.ultracode ?? (this.request ? this.effectiveUltra : null), ultracodeAvailable: this.ultraAvailable, models: [...this.models.values()].map(({ key, label, group }) => ({ key, label, group })),
      efforts: this.efforts, effortRecommended: this.recommended, fastReason: this.fastReason, pending: this.request ? { id: this.request.id, sessionId: this.request.sessionId,
        epoch: this.request.epoch, expires: this.request.expires, field: this.request.field, command: this.command } : null,
      wantedFile: true, ...(this.wanted.snapshot() ? { wanted: this.wanted.snapshot()! } : {}), ...(this.build ? { hostBuild: this.build } : {}) };
  }
  takeResult(): NativeParameterResult | null { const result = this.result; this.result = null; return result; }
  begin(value: unknown, wanted: { field: WantedField; id: string } | null = null): void {
    if (!validNativeRequest(value, this.now())) return;
    const r = value; const state = this.snapshot();
    const reject = (status: NativeParameterResult['status'], reason: string): void => {
      this.result = { version: 1, id: r.id, hostId: this.hostId, sessionId: r.sessionId, status, reason };
    };
    if (this.seen.has(r.id)) { reject('stale', 'Повтор UUID'); return; }
    this.seen.add(r.id); if (this.seen.size > 128) this.seen.delete(this.seen.values().next().value!);
    if (r.hostId !== this.hostId || r.sessionId !== state.sessionId || r.epoch !== state.epoch) { reject('stale', 'Состояние Claude изменилось'); return; }
    if (this.busy || !this.ready()) { reject('busy', state.reason ?? 'Claude занят'); return; }
    if ((r.field === 'model' && !this.models.has(r.value)) || (r.field === 'effort' && !this.efforts.includes(r.value))
      || (r.field === 'mode' && !(MODES as readonly string[]).includes(r.value))
      || (r.field === 'ultracode' && (!this.ultraAvailable || !['on', 'off'].includes(r.value)))) {
      reject('unavailable', 'Вариант не подтверждён нативным каталогом'); return;
    }
    this.request = r; this.requestAt = this.now(); this.menuOwner = null; this.cancelled = false; this.cancelRevision = -1; this.unsafe = false; this.typed = null; this.cleanups = 0;
    this.requestWanted = wanted; this.cancelCause = 'other';
    this.flow = r.field === 'catalog' ? (r.value === 'efforts' ? this.readEfforts() : this.catalog()) : this.setter(r);
    this.advance();
  }
  discover(): void {
    // A turn often cancels the startup discovery: retry on a later free, empty input, bounded so the
    // terminal is not typed into again and again.
    // M29: models once per CLI version, efforts once per model; the catalog file usually has both.
    if (this.busy || !this.ready()) return;
    const need = !this.catalogDone ? 'catalog' : !this.effortsKnown() ? 'efforts' : null;
    if (!need) return;
    const key = `${need}:${this.meta?.model.label ?? ''}`;
    if (key !== this.discoveryKey) { this.discoveryKey = key; this.discoveryTries = 0; }
    if (this.failedKeys.has(key) || this.discoveryTries >= DISCOVERY_TRIES || (this.discoveryTries > 0 && this.now() - this.discoveryAt < DISCOVERY_RETRY_MS)) return;
    this.discoveryTries += 1; this.discoveryAt = this.now();
    const state = this.snapshot();
    this.begin({ version: 1, id: randomUUID(), hostId: this.hostId, sessionId: state.sessionId,
      epoch: state.epoch, expires: this.now() + 55_000, field: 'catalog', value: need === 'efforts' ? 'efforts' : '' });
  }
  cancel(cause: 'user' | 'turn' | 'other' = 'other'): void {
    if (this.request && !this.cancelled) { this.cancelCause = cause; this.cancelled = true; }
  }
  private finish(status: NativeParameterResult['status'], reason?: string): void {
    const r = this.request!;
    if (r.field === 'catalog' && status === 'applied') { if (r.value !== 'efforts') this.catalogDone = true; this.catalogRevision++; }
    // M45: the last try failed by itself (not by the user or a turn): the catalog file keeps the key for this CLI.
    else if (r.field === 'catalog' && this.discoveryTries >= DISCOVERY_TRIES && this.cancelCause === 'other') { this.failedKeys.add(this.discoveryKey); this.catalogRevision++; }
    const wanted = this.requestWanted; this.requestWanted = null;
    this.request = null; this.flow = null; this.step = null; this.command = null; this.menuOwner = null; this.typed = null;
    if (this.meta && this.meta.model.label !== this.effortsLabel) this.useModelEfforts();
    if (wanted) {
      // A wanted field: the result goes into the state snapshot, not the legacy result file.
      if (!this.wanted.current(wanted.field, wanted.id)) return;
      if (status === 'applied') this.wanted.settle(wanted.field, 'applied', null);
      else if (status === 'cancelled' && this.cancelCause !== 'other') this.wanted.retry(wanted.field);
      else if (status === 'unavailable' || status === 'invalid') this.wanted.settle(wanted.field, 'failed', reason ?? 'Claude отклонил изменение');
      else this.wanted.count(wanted.field, status === 'timeout' ? 'Claude не подтвердил изменение вовремя' : 'Claude не принял изменение');
      return;
    }
    this.result = { version: 1, id: r.id, hostId: this.hostId, sessionId: r.sessionId, status, ...(reason ? { reason } : {}), state: this.snapshot() };
  }
  private advance(): void {
    try {
      const next = this.flow!.next(this.frame);
      this.step = next.done ? null : next.value;
      this.written = false; this.commandTyped = false;
      if (!this.step) this.finish('applied');
    } catch (error) { this.cancelled = true; this.fastReason ??= error instanceof Error ? error.message : 'Неизвестное меню'; }
  }
  propose(): NativeAction | null {
    if (this.unsafe && ((this.frame.kind === 'idle' && this.empty()) || this.now() - this.unsafeAt >= 10_000)) this.unsafe = false;
    if (!this.request || !this.step) return null;
    // Ink paints a frame in several writes; do not classify or navigate an intermediate redraw.
    if (this.now() - this.renderedAt < 200) return null;
    const f = this.frame; if (this.now() >= this.request.expires) this.cancelled = true;
    // M45: a menu of the host that waits without a key (a frame it does not know) closes after 10 s.
    if (this.menuOwner && MENUS.has(f.kind) && this.now() - this.changedAt >= MENU_IDLE_MS) this.cancel();
    if (this.cancelled) {
      // M45: a cleanup key that changed nothing is not waited for longer than 1 s, at most CLEANUP_TRIES keys.
      // M28 holds: only the host's own menu gets Esc and only its exact command is cleared, never a foreign input.
      if (this.cancelRevision === this.revision && this.now() - this.changedAt < 1000) return null;
      const typed = this.typed ?? this.command; const more = this.cleanups < CLEANUP_TRIES;
      if (more && (f.kind === 'switch' || (this.menuOwner?.submitted && this.menuOwner.kind === f.kind))) { this.cleanups++; return { kind: 'key', value: 'escape', revision: this.revision }; }
      if (more && typed && f.input?.trim() === typed) { this.cleanups++; return { kind: 'key', value: 'clear', revision: this.revision }; }
      this.unsafe = !this.clean(); this.unsafeAt = this.now();
      this.finish(this.now() >= this.request.expires ? 'timeout' : 'cancelled', 'Транзакция отменена без повтора'); return null;
    }
    const s = this.step;
    if ('until' in s) {
      if (s.until(f)) { this.advance(); return this.step ? this.propose() : null; }
      else if (f.kind === 'busy' || f.kind === 'dialog' || f.kind === 'unknown' || (f.input && f.input !== this.command && !f.placeholder)) this.cancel();
      return null;
    }
    if (this.written) {
      // The next step is proposed at once (M29): no poll is lost between two keys.
      const quiet = 'key' in s && s.quiet !== undefined && this.now() - this.changedAt >= s.quiet;
      if ((this.revision > this.changed || quiet) && this.now() - this.changedAt >= 120) { this.command = null; this.advance(); return this.step ? this.propose() : null; }
      return null;
    }
    if ('command' in s) {
      this.command = s.command;
      if (!this.commandTyped) {
        if (!this.ready()) { this.cancel(); return null; }
        return { kind: 'text', value: s.command, revision: this.revision };
      }
      if (f.input === s.command && f.mode && f.kind !== 'busy' && this.now() - this.changedAt >= 120) return { kind: 'key', value: 'enter', revision: this.revision };
      if (this.revision > this.changed && f.input !== s.command) this.cancel();
      return null;
    }
    if (f.kind !== s.frame) { this.cancel(); return null; }
    return { kind: 'key', value: s.key, revision: this.revision };
  }
  private changedAt = 0;
  sent(action: NativeAction): boolean {
    if (action.revision !== this.revision || !this.request) return false;
    this.changed = this.revision; this.changedAt = this.now();
    if (this.cancelled) { this.cancelRevision = this.revision; this.written = false; return true; }
    if (action.kind === 'text') { this.commandTyped = true; this.typed = action.value; }
    else { this.written = true; if (action.value === 'enter' && this.command && this.menuOwner) this.menuOwner.submitted = true; }
    return true;
  }
  private *open(command: string, kind: ParameterFrame['kind']): Flow {
    this.menuOwner = { kind, submitted: false, seen: false };
    yield { command }; yield { until: f => f.kind === kind };
  }
  private collect(f: ParameterFrame): void { for (const row of f.rows) {
    for (const [key, old] of this.models) if (old.index === row.index && key !== row.key) this.models.delete(key);
    this.models.set(row.key, { ...row, group: row.index > this.primaryLast || this.models.get(row.key)?.group === 'more' ? 'more' : row.group }); } }
  private *modelRows(target?: ModelRow): Flow {
    yield* this.open('/model', 'model');
    if (this.frame.more === 'closed') this.primaryLast = Math.max(...this.frame.rows.map(r => r.index));
    if (target) { yield* this.seek(target); return; }
    let expanded = this.frame.more === 'open';
    // Read the actual scrollable catalogue; never use Enter on a model or Default.
    for (let i = 0; i < 64; i++) {
      const f = this.frame; this.collect(f);
      if (f.selected === 1) break;
      yield { key: 'up', frame: 'model' };
      if (i === 63) throw new Error('Начало каталога не распознано');
    }
    for (let i = 0; i < 64; i++) {
      const f = this.frame; expanded ||= f.more === 'open'; this.collect(f);
      if (f.selected === 'more' && f.more === 'closed' && /Enter to expand/.test(f.text)) yield { key: 'enter', frame: 'model' };
      else if (typeof f.selected === 'number' && expanded && f.hiddenModels === 0
        && f.selected === Math.max(...f.rows.map(r => r.index))) return;
      else yield { key: 'down', frame: 'model' };
    }
    throw new Error('Каталог Claude слишком велик или изменился');
  }
  private *seek(target: ModelRow): Flow {
    try { yield* seekRow(() => this.frame, target); } catch (error) { if (error instanceof CatalogChanged) this.catalogDone = false; throw error; }
  }
  private effortsKnown(): boolean { return !!this.effortsLabel && this.effortsByModel.has(this.effortsLabel); }
  private *catalog(): Flow {
    // M29: /fast is never opened. M30: no /effort and no Esc: levels of the ✔ model, then `s` on it.
    yield* this.modelRows();
    const current = [...this.models.values()].find(m => m.checked);
    if (!current) { yield { key: 'escape', frame: 'model' }; yield { until: f => f.kind === 'idle' && this.empty() }; return; }
    yield* this.seek(current); yield* this.levels(current.label); yield* this.closeMenu();
  }
  private *readEfforts(): Flow {
    yield* this.open('/model', 'model');
    const row = this.frame.rows.find(r => r.selected); if (!row) throw new Error('Текущая модель не распознана');
    yield* this.levels(row.label); yield* this.closeMenu();
  }
  private *closeMenu(): Flow { yield { key: 'session', frame: 'model' }; yield { until: f => f.kind === 'idle' && this.empty() }; }
  private *levels(label: string): Flow {
    const { values, recommended } = yield* effortLevels(() => this.frame);
    this.effortsByModel.set(label, { values, recommended, ultracode: values.length > 0 }); this.catalogRevision++;
    if (label === this.meta?.model.label) this.useModelEfforts();
  }
  private *setter(r: NativeParameterRequest): Flow {
    const before = this.meta!; const submittedAt = this.now();
    if (r.field === 'mode') {
      for (let i = 0; this.frame.mode !== r.value && i < 4; i++) yield { key: 'mode', frame: 'idle' };
      if (this.frame.mode !== r.value) throw new Error('Native mode не подтверждён');
      return;
    }
    const baseline = sessionAcks(this.frame.text); const target = r.field === 'model' ? this.models.get(r.value)! : null;
    if (target) {
      // Unknown levels of the new model are read by discovery (/model, levels, s) after this transaction.
      yield* this.modelRows(target); yield { key: 'session', frame: 'model' };
      // M29: a cached conversation asks "Switch model?"; this transaction confirms its own target only.
      yield { until: f => f.kind === 'switch' || f.kind === 'idle' };
      if (this.frame.kind === 'switch') {
        if (this.frame.switchTo !== target.label || this.frame.selected !== 1) throw new Error('Диалог смены модели не распознан');
        yield { key: 'enter', frame: 'switch' };
      }
    } else if (r.field === 'effort') {
      // M30: the effort row of /model on the current model, applied with `s` (no /effort line in the feed).
      yield* this.open('/model', 'model');
      for (let i = 0; this.frame.effortLevel !== r.value && i < 5; i++) {
        const from = EFFORTS.indexOf(this.frame.effortLevel as never); const to = EFFORTS.indexOf(r.value as never);
        if (from < 0 || to < 0) throw new Error('Уровень усилия не распознан');
        yield { key: from < to ? 'right' : 'left', frame: 'model' };
      }
      if (this.frame.effortLevel !== r.value) throw new Error('Effort не выбран');
      yield { key: 'session', frame: 'model' };
    } else yield { command: r.value === 'on' ? '/effort ultracode' : '/effort ultracode off' };
    // A model is confirmed by Claude's line naming it: in plan mode the statusline shows the plan model.
    yield { until: f => f.kind === 'idle' && this.empty() && freshAck(baseline, f.text, r.field, target?.label ?? r.value) && !!this.meta
      && (target !== null || (this.meta.at >= submittedAt && (r.field === 'effort' ? this.meta.effort === r.value : f.ultracode === (r.value === 'on') && this.meta.effort === before.effort))) };
    // Unknown efforts of the new model are read once by discovery after this transaction (M29).
  }
}
