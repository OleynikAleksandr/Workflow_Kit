// Bounded atomic control files. No raw terminal frames or prompt content are persisted here.
import { ParameterEngine } from './parameter-engine.ts';
import { NATIVE_KEYS, PARAMETER_CANCEL, PARAMETER_NATIVE, PARAMETER_REQUEST, PARAMETER_RESULT, PARAMETER_STATE } from './parameter-protocol.ts';
import type { NativeAction, NativeKey, NativeMetadata } from './parameter-protocol.ts';
import type { TerminalScreen } from '#pty-host';
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
    this.engine = new ParameterEngine(hostId, cwd, screen, now);
  }
  private meta: NativeMetadata | null = null;
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
  write(action: NativeAction, write: (text: string) => boolean): boolean {
    if (!this.engine.sent(action)) return false;
    const value = action.kind === 'text' ? `\x1b[200~${action.value}\x1b[201~` : NATIVE_KEYS[action.value as NativeKey];
    if (!value || !write(value)) { this.engine.cancel(); return false; }
    return true;
  }
}
