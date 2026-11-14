// Bounded atomic control files. No raw terminal frames or prompt content are persisted here.
import { ParameterEngine } from './parameter-engine.ts';
import { NATIVE_KEYS, PARAMETER_CANCEL, PARAMETER_CATALOG, PARAMETER_NATIVE, PARAMETER_REQUEST, PARAMETER_RESULT, PARAMETER_STATE, PARAMETER_WANTED, validCatalog, validWanted } from './parameter-protocol.ts';
import type { NativeAction, NativeKey, NativeMetadata } from './parameter-protocol.ts';
import type { TerminalScreen } from '#pty-host';
import { screenState } from './interrupt-control.ts';
import { INTERRUPT_SETTLE_MS, INTERRUPTED_LINE, TURN_SUFFIX, parseTurn } from './turn-file.ts';
import type { TurnState } from './turn-file.ts';
export interface ParameterFiles {
  read(file: string): Promise<string | null>;
  take(file: string): Promise<string | null>;
  put(file: string, value: unknown): Promise<void>;
}
const json = (raw: string | null): any => { try { return raw && raw.length <= 32_768 ? JSON.parse(raw) : null; } catch { return null; } };
export class ParameterHost {
  readonly engine: ParameterEngine;
  private debug: string;
  private files: ParameterFiles;
  constructor(debug: string, hostId: string, cwd: string, screen: TerminalScreen, files: ParameterFiles, now: () => number) {
    this.debug = debug; this.files = files;
    this.engine = new ParameterEngine(hostId, cwd, screen, now); this.screen = screen; this.now = now;
  }
  private meta: NativeMetadata | null = null;
  /** CLI version whose catalog file was read, and the catalog revision last written (M29). */
  private catalogFor: string | null = null;
  private catalogWritten = 0;
  private activeAt = 0;
  private screen: TerminalScreen;
  private now: () => number;
  observe(): void { this.engine.observe(this.meta); }
  userInput(): void { this.engine.userInput(); }
  get busy(): boolean { return this.engine.busy; }
  async poll(allowDiscovery = true): Promise<NativeAction | null> {
    try {
      const metadata = json(await this.files.read(this.debug + PARAMETER_NATIVE)) as NativeMetadata | null;
      this.meta = metadata?.version === 1 && typeof metadata.sessionId === 'string' && /^[a-f0-9-]{36}$/i.test(metadata.sessionId)
        && typeof metadata.model?.id === 'string' && typeof metadata.model?.label === 'string'
        && typeof metadata.cwd === 'string' && typeof metadata.cliVersion === 'string' && Number.isFinite(metadata.at) ? metadata : null;
      this.engine.observe(this.meta);
      await this.turn();
      // The catalog of this CLI version is read once from the file the service placed (M29 3.2).
      if (this.meta && this.catalogFor !== this.meta.cliVersion) {
        this.catalogFor = this.meta.cliVersion;
        const catalog = json(await this.files.read(this.debug + PARAMETER_CATALOG));
        if (validCatalog(catalog)) this.engine.loadCatalog(catalog);
        this.catalogWritten = this.engine.catalogRevision;
      }
      const wanted = json(await this.files.read(this.debug + PARAMETER_WANTED));
      this.engine.want(validWanted(wanted) ? wanted : null);
      const cancel = json(await this.files.take(this.debug + PARAMETER_CANCEL));
      if (cancel?.hostId === this.engine.hostId) this.engine.cancel();
      if (await this.files.take(this.debug + '.parameters-input') !== null) this.engine.userInput();
      const request = json(await this.files.take(this.debug + PARAMETER_REQUEST));
      if (request) this.engine.begin(request);
      // Wanted choices first; discovery brings the catalog a choice may still need.
      if (allowDiscovery) { this.engine.pursue(); this.engine.discover(); }
      const action = this.engine.propose();
      const result = this.engine.takeResult();
      // Publish trusted pending identity before any native input (including background discovery).
      await this.files.put(this.debug + PARAMETER_STATE, this.engine.snapshot());
      if (result) await this.files.put(this.debug + PARAMETER_RESULT, result);
      const catalog = this.engine.catalogRevision !== this.catalogWritten ? this.engine.exportCatalog() : null;
      if (catalog) { await this.files.put(this.debug + PARAMETER_CATALOG, catalog); this.catalogWritten = this.engine.catalogRevision; }
      return action;
    } catch { this.engine.cancel(); return null; }
  }
  /** Reads <debug>.turn; Claude sends no Stop hook after Esc, so a settled interruption is written here. */
  private async turn(): Promise<void> {
    let turn: TurnState | null = parseTurn(await this.files.read(this.debug + TURN_SUFFIX));
    const state = screenState(this.screen); const now = this.now();
    if (state === 'working' || state === 'dialog') this.activeAt = now;
    if (turn?.state === 'working' && state === 'idle' && this.activeAt > turn.at && now - this.activeAt >= INTERRUPT_SETTLE_MS) {
      const lines = this.screen.text().split('\n'); const tail = lines.slice(-24).join('\n');
      if (INTERRUPTED_LINE.test(tail)) {
        turn = { version: 1, state: 'idle', at: now, source: 'interrupt' };
        await this.files.put(this.debug + TURN_SUFFIX, turn);
      }
    }
    this.engine.observeTurn(turn);
  }
  write(action: NativeAction, write: (text: string) => boolean): boolean {
    if (!this.engine.sent(action)) return false;
    const value = action.kind === 'text' ? `\x1b[200~${action.value}\x1b[201~` : NATIVE_KEYS[action.value as NativeKey];
    if (!value || !write(value)) { this.engine.cancel(); return false; }
    return true;
  }
}
/** Codes of a file Windows still holds open for a reader (antivirus, the other process). */
const BUSY = new Set(['EPERM', 'EBUSY', 'EACCES']);
/**
 * Atomic replace of a control file (M29): write `<file>.partial`, then rename over the target. On
 * Windows a reader may hold the target for a moment, so a busy rename is retried a few times.
 */
export async function replaceFile(file: string, text: string, ops: {
  write(path: string, text: string): Promise<void>; rename(from: string, to: string): Promise<void>; sleep(ms: number): Promise<void>;
}, tries = 5): Promise<void> {
  await ops.write(file + '.partial', text);
  for (let attempt = 1; ; attempt++) {
    try { await ops.rename(file + '.partial', file); return; }
    catch (error) {
      if (attempt >= tries || !BUSY.has((error as NodeJS.ErrnoException).code ?? '')) throw error;
      await ops.sleep(20 * attempt);
    }
  }
}
