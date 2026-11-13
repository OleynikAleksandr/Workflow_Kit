// One native transaction. The engine proposes keys; the host rechecks the screen revision before writing.
import { folderKey } from '../folder-key.ts';
import { randomUUID } from 'node:crypto';
import type { TerminalScreen } from '#pty-host';
import { parameterFrame } from './parameter-screen.ts';
import type { ParameterFrame, ModelRow } from './parameter-screen.ts';
import { MODES, supportedNativeVersion, validNativeRequest } from './parameter-protocol.ts';
import type { NativeAction, NativeMetadata, NativeParameterRequest, NativeParameterResult, NativeParameterState, NativeModelOption } from './parameter-protocol.ts';

type Step = { command: string } | { key: string; frame: ParameterFrame['kind'] } | { until: (f: ParameterFrame) => boolean };
type Flow = Generator<Step, void, ParameterFrame>;
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
  private fastReason: string | null = null;
  private ultraAvailable = false;
  private discoveryAttempted = false;
  private virgin = true;
  private unsafe = false;
  readonly hostId: string;
  readonly cwd: string;
  private screen: TerminalScreen;
  private now: () => number;
  constructor(hostId: string, cwd: string, screen: TerminalScreen, now: () => number) {
    this.hostId = hostId; this.cwd = cwd; this.screen = screen; this.now = now;
    this.frame = parameterFrame(screen);
  }
  observe(metadata: NativeMetadata | null): void {
    const oldModel = this.meta?.model.id;
    this.meta = metadata?.hostId === this.hostId && folderKey(metadata.cwd) === folderKey(this.cwd) ? metadata : null;
    if (oldModel && this.meta?.model.id !== oldModel && !this.request) { this.efforts = []; this.recommended = null; this.ultraAvailable = false; this.discoveryAttempted = false; }
    const f = parameterFrame(this.screen);
    const signature = JSON.stringify([f.kind, f.input, f.mode, f.ultracode, f.selected, f.previewEffort, this.meta?.model, this.meta?.effort]);
    if (signature !== this.signature) { this.signature = signature; this.epoch++; }
    if (f.kind === 'idle' && (f.input === '' || (this.virgin && f.placeholder))) { this.effectiveMode = f.mode; this.effectiveUltra = f.ultracode; }
    if (this.menuOwner?.submitted) {
      if (f.kind === this.menuOwner.kind) this.menuOwner.seen = true;
      else if (this.menuOwner.seen && f.kind === 'idle') this.menuOwner = null;
    }
    this.frame = f;
    const rendered = JSON.stringify([f.text, this.screen.cursor()]);
    if (rendered !== this.rendered) { this.rendered = rendered; this.renderedAt = this.now(); this.revision++; }
  }
  userInput(): void { this.virgin = false; if (this.request) this.cancel(); }
  get busy(): boolean { return this.request !== null || this.unsafe; }
  private empty(): boolean { return this.frame.input === '' || (this.virgin && this.frame.placeholder); }
  private ready(): boolean {
    return !!this.meta && supportedNativeVersion(this.meta.cliVersion) && this.frame.kind === 'idle'
      && this.empty() && this.frame.mode !== null && this.now() >= this.meta.at;
  }
  snapshot(): NativeParameterState {
    const f = this.frame; const m = this.meta;
    const status = this.request ? 'control' : !m || !supportedNativeVersion(m.cliVersion) || this.now() < m.at ? 'unknown'
      : f.kind === 'idle' && this.empty() ? 'idle' : f.kind === 'busy' ? 'busy' : f.kind === 'unknown' ? 'unknown' : 'dialog';
    return { version: 1, hostId: this.hostId, sessionId: m?.sessionId ?? '', epoch: `${this.hostId}:${this.epoch}`,
      at: this.now(), cliVersion: m?.cliVersion ?? '', status, inputEmpty: this.empty(),
      reason: status === 'idle' ? null : !m ? 'Нет native statusline этого host' : !this.empty() && f.input !== null ? 'В Claude есть черновик' : 'Терминал Claude занят или не распознан',
      model: m?.model ?? null, effort: m?.effort === 'ultra' ? f.baseEffort : m?.effort ?? null,
      mode: f.mode ?? (this.request ? this.effectiveMode : null), fast: m?.fast ?? null, ultracode: f.ultracode ?? (this.request ? this.effectiveUltra : null), ultracodeAvailable: this.ultraAvailable, models: [...this.models.values()].map(({ key, label, group }) => ({ key, label, group })),
      efforts: this.efforts, effortRecommended: this.recommended, fastReason: this.fastReason, pending: this.request ? { id: this.request.id, sessionId: this.request.sessionId,
        epoch: this.request.epoch, expires: this.request.expires, field: this.request.field, command: this.command } : null };
  }
  takeResult(): NativeParameterResult | null { const result = this.result; this.result = null; return result; }
  begin(value: unknown): void {
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
    this.request = r; this.menuOwner = null; this.cancelled = false; this.cancelRevision = -1; this.unsafe = false;
    this.flow = r.field === 'catalog' ? this.catalog() : this.setter(r);
    this.advance();
  }
  discover(): void {
    if (this.discoveryAttempted || this.busy || !this.ready()) return;
    this.discoveryAttempted = true;
    const state = this.snapshot();
    this.begin({ version: 1, id: randomUUID(), hostId: this.hostId, sessionId: state.sessionId,
      epoch: state.epoch, expires: this.now() + 55_000, field: 'catalog', value: '' });
  }
  cancel(): void { if (this.request) this.cancelled = true; }
  private finish(status: NativeParameterResult['status'], reason?: string): void {
    const r = this.request!;
    this.request = null; this.flow = null; this.step = null; this.command = null; this.menuOwner = null;
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
    if (this.unsafe && this.frame.kind === 'idle' && this.empty()) this.unsafe = false;
    if (!this.request || !this.step) return null;
    // Ink paints a frame in several writes; do not classify or navigate an intermediate redraw.
    if (this.now() - this.renderedAt < 200) return null;
    const f = this.frame;
    if (this.now() >= this.request.expires) this.cancelled = true;
    if (this.cancelled) {
      if (this.cancelRevision === this.revision) return null;
      if (this.menuOwner?.submitted && this.menuOwner.kind === f.kind) return { kind: 'key', value: 'escape', revision: this.revision };
      if (this.command && f.input === this.command) return { kind: 'key', value: 'clear', revision: this.revision };
      this.unsafe = !(f.kind === 'idle' && this.empty());
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
  private *modelRows(target?: NativeModelOption): Flow {
    yield* this.open('/model', 'model');
    if (this.frame.more === 'closed') this.primaryLast = Math.max(...this.frame.rows.map(r => r.index));
    let expanded = this.frame.more === 'open';
    // Read the actual scrollable catalogue; never use Enter on a model or Default.
    for (let i = 0; i < 64; i++) {
      const f = this.frame; if (!target) this.collect(f);
      if (f.selected === 1) break;
      yield { key: 'up', frame: 'model' };
      if (i === 63) throw new Error('Начало каталога не распознано');
    }
    for (let i = 0; i < 64; i++) {
      const f = this.frame; expanded ||= f.more === 'open'; if (!target) this.collect(f);
      const row = f.rows.find(r => r.selected);
      if (target && row?.key === target.key) return;
      if (f.selected === 'more' && f.more === 'closed' && /Enter to expand/.test(f.text)) yield { key: 'enter', frame: 'model' };
      else if (typeof f.selected === 'number' && expanded && f.hiddenModels === 0
        && f.selected === Math.max(...f.rows.map(r => r.index))) {
        if (target) throw new Error('Модель исчезла из нативного меню');
        return;
      } else yield { key: 'down', frame: 'model' };
    }
    throw new Error('Каталог Claude слишком велик или изменился');
  }
  private *catalog(): Flow {
    yield* this.modelRows(); yield { key: 'escape', frame: 'model' }; yield { until: f => f.kind === 'idle' && this.empty() };
    yield* this.readEfforts();
    yield* this.open('/fast', 'fast');
    this.fastReason = /requires usage credits/.test(this.frame.text) ? 'Fast mode requires usage credits' : 'Session-local переключение fast не подтверждено для этой среды';
    yield { key: 'escape', frame: 'fast' }; yield { until: f => f.kind === 'idle' && this.empty() };
  }
  private *readEfforts(): Flow {
    yield* this.open('/effort', 'effort');
    if (!this.frame.efforts.length) throw new Error('Неизвестная форма effort');
    this.efforts = this.frame.efforts; this.ultraAvailable = this.frame.ultraAvailable;
    this.recommended = null;
    // Preview only: inspect native descriptions without saving any effort/default.
    for (let i = 0; this.frame.previewEffort !== this.efforts[0] && i < 5; i++) yield { key: 'left', frame: 'effort' };
    for (let i = 0; i < this.efforts.length; i++) {
      if (/The default effort for this model/.test(this.frame.text)) this.recommended = this.frame.previewEffort;
      if (i < this.efforts.length - 1) yield { key: 'right', frame: 'effort' };
    }
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
    if (r.field === 'model') yield* this.readEfforts();
  }
}
