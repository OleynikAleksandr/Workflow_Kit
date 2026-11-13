// A small bounded VT screen for classification, never a transcript. Unknown controls fail closed.
export class TerminalScreen {
  private grid: string[][];
  private row = 0;
  private col = 0;
  private pending = '';
  valid = true;
  revision = 0;
  private rows: number;
  private cols: number;
  constructor(rows = 40, cols = 160) { this.rows = rows; this.cols = cols; this.grid = Array.from({ length: rows }, () => Array<string>(cols).fill(' ')); }
  text(): string { return this.grid.map((r) => r.join('').trimEnd()).join('\n'); }
  feed(chunk: string): void {
    this.revision += 1;
    const input = this.pending + chunk;
    this.pending = '';
    for (let i = 0; i < input.length;) {
      if (input[i] === '\x1b') {
        const rest = input.slice(i);
        const csi = /^\x1b\[([0-?]*)([ -/]*)([@-~])/.exec(rest);
        const osc = /^\x1b\][\s\S]*?(?:\x07|\x1b\\)/.exec(rest);
        if (csi) { this.csi(csi[1]!, csi[3]!); i += csi[0].length; continue; }
        if (osc) { i += osc[0].length; continue; }
        if (rest.length < 256 && (/^\x1b(?:\[[0-?]*[ -/]*|\][^\x07]*)?$/.test(rest))) { this.pending = rest; break; }
        this.valid = false; i += 2; continue;
      }
      const char = String.fromCodePoint(input.codePointAt(i)!); i += char.length;
      if (char === '\r') this.col = 0;
      else if (char === '\n') this.down();
      else if (char === '\b') this.col = Math.max(0, this.col - 1);
      else if (char === '\t') this.col = Math.min(this.cols - 1, (Math.floor(this.col / 8) + 1) * 8);
      else if (char >= ' ') {
        if (this.col >= this.cols) { this.col = 0; this.down(); }
        this.grid[this.row]![this.col++] = char;
      }
    }
  }
  private down(): void {
    this.row += 1;
    if (this.row >= this.rows) { this.grid.shift(); this.grid.push(Array<string>(this.cols).fill(' ')); this.row = this.rows - 1; }
  }
  private csi(raw: string, op: string): void {
    if (op === 'm' || (/^[?>]/.test(raw) && ['h', 'l'].includes(op))) return;
    const args = raw.split(';').map((v) => Number(v || 0));
    const n = args[0] || 1;
    const clamp = () => { this.row = Math.max(0, Math.min(this.rows - 1, this.row)); this.col = Math.max(0, Math.min(this.cols - 1, this.col)); };
    if (op === 'A') this.row -= n;
    else if (op === 'B') this.row += n;
    else if (op === 'C') this.col += n;
    else if (op === 'D') this.col -= n;
    else if (op === 'G') this.col = n - 1;
    else if (op === 'd') this.row = n - 1;
    else if (op === 'H' || op === 'f') { this.row = n - 1; this.col = (args[1] || 1) - 1; }
    else if (op === 'K') {
      const start = args[0] === 1 || args[0] === 2 ? 0 : this.col;
      const end = args[0] === 1 ? this.col + 1 : this.cols;
      this.grid[this.row]!.fill(' ', start, end);
    } else if (op === 'J' && (args[0] === 2 || args[0] === 3)) {
      this.grid = Array.from({ length: this.rows }, () => Array<string>(this.cols).fill(' ')); this.valid = true;
    } else if (op === 'J' && args[0] === 0) {
      this.grid[this.row]!.fill(' ', this.col);
      for (let r = this.row + 1; r < this.rows; r++) this.grid[r]!.fill(' ');
    } else this.valid = false;
    clamp();
  }
}
