// Public interface of pty-host (spec M5 section 2); other modules import only from here (#pty-host).
export type { NodePty, NodePtyOptions, NodePtyProcess } from './loader.ts';
export { NODE_PTY_VERSION, PtyUnavailableError, loadNodePty, ptyUnavailable, vendorDir } from './loader.ts';
export type { Terminal, TerminalOptions, TreeKiller } from './terminal.ts';
export { startTerminal, taskkillTree } from './terminal.ts';
