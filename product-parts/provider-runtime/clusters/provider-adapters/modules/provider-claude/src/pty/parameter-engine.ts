// One native transaction. The engine proposes keys; the host rechecks the screen revision before writing.
import { folderKey } from '../folder-key.ts';
import { randomUUID } from 'node:crypto';
import type { TerminalScreen } from '#pty-host';
import { parameterFrame } from './parameter-screen.ts';
import type { ParameterFrame, ModelRow } from './parameter-screen.ts';
import { FAST_REASON, MODES, supportedNativeVersion, validNativeRequest } from './parameter-protocol.ts';
import type { TurnState } from './turn-file.ts';
import type { NativeAction, NativeCatalog, NativeEfforts, NativeMetadata, NativeParameterRequest, NativeParameterResult, NativeParameterState, NativeWanted, WantedField } from './parameter-protocol.ts';
import { WantedChoices } from './parameter-wanted.ts';

/** The statusline cwd follows the agent's cd (M28): the session folder or a folder inside it. */
export function insideFolder(cwd: string, root: string): boolean {
  const a = folderKey(cwd).replace(/\\/g, '/'); const b = folderKey(root).replace(/\\/g, '/').replace(/\/+$/, '');
  return a === b || a.startsWith(b + '/');
}
type Step = { command: string } | { key: string; frame: ParameterFrame['kind'] } | { until: (f: ParameterFrame) => boolean };
type Flow = Generator<Step, void, ParameterFrame>;
/** Discovery of the native catalog: attempts per model and the pause between them (M28 T014). */
export const DISCOVERY_TRIES = 3;
export const DISCOVERY_RETRY_MS = 30_000;
export class ParameterEngine {
  private revision = 0;
  private rendered = '';
  private renderedAt = 0;
  private cancelRevision = -1;
  private epoch = 0;
  private signature = '';
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
  private turn: TurnState | null = null;
  readonly hostId: string;
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
  userInput(): void { if (this.request) this.cancel('user'); }
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
    this.catalogDone = this.models.size > 0;
    this.useModelEfforts();
    return this.catalogDone;
  }
  exportCatalog(): NativeCatalog | null {
    return !this.catalogDone || !this.meta ? null : { version: 1, cliVersion: this.meta.cliVersion, primaryLast: this.primaryLast,
      models: [...this.models.values()].map(({ key, label, group, index }) => ({ key, label, group, index })),
      efforts: Object.fromEntries(this.effortsByModel) };
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
    const need = field === 'model' ? !this.catalogDone : field === 'mode' ? false : !this.efforts.length;
    return need && this.discoveryTries < DISCOVERY_TRIES;
  }
  /**
   * Applies the next wanted field on a free, empty input (M29 3.2): one transaction at a time, in
   * WANTED_ORDER; an already effective value is applied without keys.
   */
  want(value: NativeWanted | null): void { this.wanted.update(value, this.hostId, this.meta?.sessionId ?? null); }
  pursue(): void {
    if (!this.wanted.active || this.busy || !this.ready()) return;
    for (const { field, status: st } of this.wanted.open()) {
      if (this.effective(field, st.value)) { this.wanted.settle(field, 'applied', null); continue; }
      if (this.waitsForCatalog(field)) continue;
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
    const menu = ['model', 'effort', 'fast'].includes(this.frame.kind);
    if (!this.request && !(this.unsafe && menu)) { this.unsafe = false; this.yieldAt = 0; return false; }
    if (this.request) this.cancel('user');
    if (!this.yieldAt) this.yieldAt = this.now();
    if (this.now() - this.yieldAt < 2000) return true;
    if (this.request) this.finish('cancelled', 'Транзакция отменена сообщением пользователя');
    this.unsafe = false; this.yieldAt = 0;
    return false;
  }
  get turnWorking(): boolean { return this.turn?.state === 'working'; }
  current(): ParameterFrame { return this.frame; }
  get busy(): boolean { return this.request !== null || this.unsafe; }
  /** A transaction still owns the input (its own cleanup included); `unsafe` alone does not (M28 T012). */
  get transacting(): boolean { return this.request !== null; }
  private empty(): boolean { return this.frame.input === '' || this.frame.placeholder; }
  private ready(): boolean {
    return !!this.meta && supportedNativeVersion(this.meta.cliVersion) && this.frame.kind === 'idle' && !this.turnWorking
      && this.empty() && this.frame.mode !== null && this.now() >= this.meta.at;
  }
  snapshot(): NativeParameterState {
    const f = this.frame; const m = this.meta;
    const status = this.request ? 'control' : this.turnWorking ? 'busy' : !m || !supportedNativeVersion(m.cliVersion) || this.now() < m.at ? 'unknown'
      : f.kind === 'idle' && this.empty() ? 'idle' : f.kind === 'busy' ? 'busy' : f.kind === 'unknown' ? 'unknown' : 'dialog';
    return { version: 1, hostId: this.hostId, sessionId: m?.sessionId ?? '', epoch: `${this.hostId}:${this.epoch}`,
      at: this.now(), cliVersion: m?.cliVersion ?? '', status, inputEmpty: this.empty(),
      reason: status === 'idle' ? null : status === 'busy' && this.turnWorking ? 'Claude отвечает' : !m ? 'Нет native statusline этого host' : !this.empty() && f.input !== null ? 'В Claude есть черновик' : 'Терминал Claude занят или не распознан',
      model: m?.model ?? null, effort: m?.effort === 'ultra' ? f.baseEffort : m?.effort ?? null,
      mode: f.mode ?? this.effectiveMode, fast: m?.fast ?? null, ultracode: f.ultracode ?? (this.request ? this.effectiveUltra : null), ultracodeAvailable: this.ultraAvailable, models: [...this.models.values()].map(({ key, label, group }) => ({ key, label, group })),
      efforts: this.efforts, effortRecommended: this.recommended, fastReason: this.fastReason, pending: this.request ? { id: this.request.id, sessionId: this.request.sessionId,
        epoch: this.request.epoch, expires: this.request.expires, field: this.request.field, command: this.command } : null,
      wantedFile: true, ...(this.wanted.snapshot() ? { wanted: this.wanted.snapshot()! } : {}) };
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
    this.request = r; this.requestAt = this.now(); this.menuOwner = null; this.cancelled = false; this.cancelRevision = -1; this.unsafe = false;
    this.requestWanted = wanted; this.cancelCause = 'other';
    this.flow = r.field === 'catalog' ? (r.value === 'efforts' ? this.readEfforts() : this.catalog()) : this.setter(r);
    this.advance();
  }
  discover(): void {
    // A turn often cancels the startup discovery: retry on a later free, empty input, bounded so the
    // terminal is not typed into again and again.
    // M29: models once per CLI version, efforts once per model; the catalog file usually has both.
    if (this.busy || !this.ready()) return;
    const need = !this.catalogDone ? 'catalog' : !this.efforts.length ? 'efforts' : null;
    if (!need) return;
    const key = `${need}:${this.meta?.model.label ?? ''}`;
    if (key !== this.discoveryKey) { this.discoveryKey = key; this.discoveryTries = 0; }
    if (this.discoveryTries >= DISCOVERY_TRIES || (this.discoveryTries > 0 && this.now() - this.discoveryAt < DISCOVERY_RETRY_MS)) return;
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
    const wanted = this.requestWanted; this.requestWanted = null;
    this.request = null; this.flow = null; this.step = null; this.command = null; this.menuOwner = null;
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
    const f = this.frame;
    if (this.now() >= this.request.expires) this.cancelled = true;
    if (this.cancelled) {
      if (this.cancelRevision === this.revision) return null;
      if (this.menuOwner?.submitted && this.menuOwner.kind === f.kind) return { kind: 'key', value: 'escape', revision: this.revision };
      if (this.command && f.input === this.command) return { kind: 'key', value: 'clear', revision: this.revision };
      this.unsafe = !(f.kind === 'idle' && this.empty()); this.unsafeAt = this.now();
      this.finish(this.now() >= this.request.expires ? 'timeout' : 'cancelled', 'Транзакция отменена без повтора'); return null;
    }
    const s = this.step;
    if ('until' in s) {
      if (s.until(f)) this.advance();
      else if (f.kind === 'busy' || f.kind === 'dialog' || f.kind === 'unknown' || (f.input && f.input !== this.command && !f.placeholder)) this.cancel();
      return null;
    }
    if (this.written) {
      if (this.revision > this.changed && this.now() - this.changedAt >= 120) { this.command = null; this.advance(); }
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
    if (action.kind === 'text') this.commandTyped = true;
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
  /**
   * M29: the menu opens on the current model; move by the cached row number towards the target and
   * stop on its label. A row with the target's number but another label means a changed catalog.
   */
  private *seek(target: ModelRow): Flow {
    for (let i = 0; i < 64; i++) {
      const f = this.frame; const row = f.rows.find(r => r.selected);
      if (row?.key === target.key) return;
      if (f.selected === 'more') {
        if (target.group === 'more' && f.more === 'closed' && /Enter to expand/.test(f.text)) yield { key: 'enter', frame: 'model' };
        else yield { key: target.group === 'more' ? 'down' : 'up', frame: 'model' };
        continue;
      }
      const at = typeof f.selected === 'number' ? f.selected : null;
      if (at !== null && at === target.index && row && row.key !== target.key) { this.catalogDone = false; throw new Error('Каталог Claude изменился'); }
      yield { key: at === null || (target.group === 'more' && f.more === 'closed') || target.index > at ? 'down' : 'up', frame: 'model' };
    }
    throw new Error('Модель не найдена в меню Claude');
  }
  private *catalog(): Flow {
    // M29: /fast is never opened; speed is shown from the statusline only.
    yield* this.modelRows(); yield { key: 'escape', frame: 'model' }; yield { until: f => f.kind === 'idle' && this.empty() };
    yield* this.readEfforts();
  }
  private *readEfforts(): Flow {
    yield* this.open('/effort', 'effort');
    if (!this.frame.efforts.length) throw new Error('Неизвестная форма effort');
    this.efforts = this.frame.efforts; this.ultraAvailable = this.frame.ultraAvailable;
    this.recommended = null; const label = this.meta?.model.label ?? null;
    // Preview only: inspect native descriptions without saving any effort/default.
    for (let i = 0; this.frame.previewEffort !== this.efforts[0] && i < 5; i++) yield { key: 'left', frame: 'effort' };
    for (let i = 0; i < this.efforts.length; i++) {
      if (/The default effort for this model/.test(this.frame.text)) this.recommended = this.frame.previewEffort;
      if (i < this.efforts.length - 1) yield { key: 'right', frame: 'effort' };
    }
    if (label) { this.effortsByModel.set(label, { values: [...this.efforts], recommended: this.recommended, ultracode: this.ultraAvailable }); this.effortsLabel = label; this.catalogRevision++; }
    yield { key: 'escape', frame: 'effort' }; yield { until: f => f.kind === 'idle' && this.empty() };
  }
  private *setter(r: NativeParameterRequest): Flow {
    const before = this.meta!; const submittedAt = this.now();
    if (r.field === 'mode') {
      for (let i = 0; this.frame.mode !== r.value && i < 4; i++) yield { key: 'mode', frame: 'idle' };
      if (this.frame.mode !== r.value) throw new Error('Native mode не подтверждён');
      return;
    }
    const acks = (text: string): string[] => text.split('\n').filter(line => /⎿\s+(?:Set model to .* for this session only|(?:Set effort level to|Ultracode on).*\(this session only\)|Ultracode off\. Effort stays )/.test(line));
    const baseline = acks(this.frame.text);
    const freshAck = (f: ParameterFrame): boolean => {
      const next = acks(f.text); const last = next.at(-1);
      if (!last || (last === baseline.at(-1) && next.length <= baseline.length)) return false;
      return r.field === 'model' ? last.includes('Set model to ') : r.field === 'effort' ? last.includes(`Set effort level to ${r.value} `) : last.includes(`Ultracode ${r.value === 'on' ? 'on' : 'off'}`);
    };
    if (r.field === 'model') {
      yield* this.modelRows(this.models.get(r.value)!); yield { key: 'session', frame: 'model' };
    } else if (r.field === 'effort') {
      yield* this.open('/effort', 'effort');
      for (let i = 0; this.frame.previewEffort !== r.value && i < 5; i++) {
        const from = this.frame.efforts.indexOf(this.frame.previewEffort ?? ''); const to = this.frame.efforts.indexOf(r.value);
        if (from < 0 || to < 0) throw new Error('Effort preview не распознан');
        yield { key: from < to ? 'right' : 'left', frame: 'effort' };
      }
      if (this.frame.previewEffort !== r.value) throw new Error('Effort не выбран');
      yield { key: 'session', frame: 'effort' };
    } else yield { command: r.value === 'on' ? '/effort ultracode' : '/effort ultracode off' };
    yield { until: f => f.kind === 'idle' && this.empty() && freshAck(f) && !!this.meta && this.meta.at >= submittedAt
      && (r.field === 'model' ? this.meta.model.label === this.models.get(r.value)?.label
        : r.field === 'effort' ? this.meta.effort === r.value : f.ultracode === (r.value === 'on') && this.meta.effort === before.effort) };
    // Efforts of a model are read once (M29); the catalog file keeps them.
    if (r.field === 'model' && !this.effortsByModel.has(this.models.get(r.value)!.label)) yield* this.readEfforts();
  }
}
