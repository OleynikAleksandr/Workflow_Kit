// Bounded atomic control files. No raw terminal frames or prompt content are persisted here.
import { ParameterEngine } from './parameter-engine.ts';
import { NATIVE_KEYS, PARAMETER_CANCEL, PARAMETER_NATIVE, PARAMETER_REQUEST, PARAMETER_RESULT, PARAMETER_STATE } from './parameter-protocol.ts';
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
      const cancel = json(await this.files.take(this.debug + PARAMETER_CANCEL));
      if (cancel?.hostId === this.engine.hostId) this.engine.cancel();
      if (await this.files.take(this.debug + '.parameters-input') !== null) this.engine.userInput();
      const request = json(await this.files.take(this.debug + PARAMETER_REQUEST));
      if (request) this.engine.begin(request);
      if (allowDiscovery) this.engine.discover();
      const action = this.engine.propose();
      const result = this.engine.takeResult();
      // Publish trusted pending identity before any native input (including background discovery).
      await this.files.put(this.debug + PARAMETER_STATE, this.engine.snapshot());
      if (result) await this.files.put(this.debug + PARAMETER_RESULT, result);
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
