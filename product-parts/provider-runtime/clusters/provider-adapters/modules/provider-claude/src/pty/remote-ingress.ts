// M45 3.1: a message of the user from the desktop app or the iPad (Remote Control) goes straight
// into the running claude process, past the terminal the parameter host types into. Claude logs it
// in its debug file (--debug-file, the path the host already has) as
// `[bridge:repl] Ingress message type=user`; the host reads the new part of that file on each poll
// and gives way to the message at once (ParameterEngine.userInput) instead of keeping its menu open.
// Only the presence of that line is read; no message text is kept.

/** The debug line of a user's message that came over Remote Control. */
export const INGRESS_LINE = /\[bridge:repl\] Ingress message type=user/;
/** At most this many bytes are read per poll; a longer burst is read from its end. */
export const INGRESS_MAX_READ = 256 * 1024;

/** File access of the watch; tests inject it. */
export interface IngressFiles {
  /** Size of the file in bytes, null when it does not exist. */
  size(file: string): Promise<number | null>;
  /** The UTF-8 text of the bytes [start, end). */
  slice(file: string, start: number, end: number): Promise<string>;
}

/** Watches the debug file of one claude process for Remote Control messages. */
export class IngressWatch {
  private offset: number | null = null;
  private carry = '';
  private readonly file: string;
  private readonly files: IngressFiles;
  constructor(file: string, files: IngressFiles) {
    this.file = file; this.files = files;
  }
  /** True when a Remote Control message was logged since the previous poll. The first poll only marks the end. */
  async poll(): Promise<boolean> {
    const size = await this.files.size(this.file).catch(() => null);
    if (size === null) return false;
    if (this.offset === null || size < this.offset) { this.offset = size; this.carry = ''; return false; }
    if (size === this.offset) return false;
    const start = Math.max(this.offset, size - INGRESS_MAX_READ);
    const text = this.carry + (await this.files.slice(this.file, start, size).catch(() => ''));
    this.offset = size;
    // The part after the last line break may be a line cut in two: it is matched with the next read.
    const end = text.lastIndexOf('\n');
    this.carry = end < 0 ? text.slice(-512) : text.slice(end + 1);
    return INGRESS_LINE.test(end < 0 ? '' : text.slice(0, end));
  }
}
