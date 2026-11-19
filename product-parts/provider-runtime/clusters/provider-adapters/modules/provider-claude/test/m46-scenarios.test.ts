// M46 T003: the S_001 case of 19.11.2026 on the parameter host with the loop of interrupt-worker.ts
// (legacy file → userInput, poll, write the action, yieldToUser holds the file) and the simulated
// Claude 2.1.328 terminal (test/claude-2-1-328.ts):
//  1. «Extra» from the panel: the effort change opens /model, sets the level with s and leaves an
//     empty input; the next panel message goes into it.
//  2. A panel message arrives while the host's 2.1.328 menu is open: the transaction is cancelled,
//     the host closes its own menu (it is no foreign dialog any more) and the text goes into an empty
//     input within a few seconds.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { TerminalScreen } from '#pty-host';
import { ParameterHost } from '../src/pty/parameter-files.ts';
import { NATIVE_KEYS, PARAMETER_NATIVE, PARAMETER_WANTED } from '../src/pty/parameter-protocol.ts';
import type { NativeMetadata } from '../src/pty/parameter-protocol.ts';
import { Claude2128 } from './claude-2-1-328.ts';

const hostId = randomUUID(); const sessionId = randomUUID();
const DEBUG = '/logs/session-20261119T144923-890c98.debug.log';

function world(wanted: () => unknown = () => null) {
  let now = 1_795_099_800_000;
  const screen = new TerminalScreen();
  const meta: NativeMetadata = { version: 1, hostId, sessionId, cwd: '/Volumes/Backup/S_001', cliVersion: '2.1.328', model: { id: 'claude-opus-5-5', label: 'Opus 5.5' }, effort: 'xhigh', fast: false, at: now - 10 };
  const claude = new Claude2128(meta, () => now);
  const host = new ParameterHost(DEBUG, hostId, '/Volumes/Backup/S_001', screen, {
    read: async (file) => (file === DEBUG + PARAMETER_NATIVE ? JSON.stringify(meta) : file === DEBUG + PARAMETER_WANTED ? JSON.stringify(wanted()) : null),
    take: async () => null, put: async () => undefined,
  }, () => now);
  const render = () => { screen.feed(`\x1b[2J\x1b[H${'\r\n'.repeat(4)}${claude.screen()}`); host.observe(); };
  render();
  const pasted: string[] = [];
  const poll = async (legacy: boolean): Promise<boolean> => {
    now += 250;
    if (legacy) host.userInput();
    const action = await host.poll(!legacy);
    if (action) host.write(action, () => { claude.input(action.kind === 'text' ? action.value : NATIVE_KEYS[action.value as keyof typeof NATIVE_KEYS]); render(); return true; });
    return !(legacy ? host.engine.yieldToUser() : host.busy);
  };
  const paste = (text: string) => {
    assert.equal(claude.menu, false, 'never into the menu'); assert.equal(claude.draft, '', 'never after a command');
    pasted.push(text);
  };
  return { claude, meta, poll, paste, pasted, now: () => now };
}

test('S_001, case 1: «Extra» from the panel on 2.1.328 leaves an empty input; the next message goes into it', async () => {
  const want = { version: 1, hostId, sessionId, changes: { effort: 'max' }, ids: { effort: randomUUID() } };
  const w = world(() => want);
  // The catalog first (discovery), then the wanted effort — as the host does after its start.
  for (let i = 0; i < 400 && w.meta.effort !== 'max'; i++) await w.poll(false);
  assert.equal(w.meta.effort, 'max', 'the effort was applied');
  for (let i = 0; i < 40 && (w.claude.menu || w.claude.draft); i++) await w.poll(false);
  assert.equal(w.claude.menu, false); assert.equal(w.claude.draft, '');
  assert.equal(w.claude.enterOnModel, 0, 'no default was saved');
  let polls = 0;
  while (!(await w.poll(true))) { polls += 1; assert.ok(polls < 40); }
  w.paste('Сделай маленькую утилиту на Node.js');
  assert.deepEqual(w.pasted, ['Сделай маленькую утилиту на Node.js']);
});

test('S_001, case 2: a panel message while the host\'s 2.1.328 menu is open closes the menu and goes into an empty input', async () => {
  const w = world();
  for (let i = 0; i < 40 && !w.claude.menu; i++) await w.poll(false);
  assert.equal(w.claude.menu, true, 'the host opened /model for the catalog of 2.1.328');
  let polls = 0;
  while (!(await w.poll(true))) { polls += 1; assert.ok(polls < 40, `the text is held at most a few seconds (menu ${w.claude.menu})`); }
  w.paste('Сделай маленькую утилиту на Node.js');
  assert.ok(w.claude.acks.some((line) => line.includes('Kept model as Opus 5.5')), 'the host closed its menu with Esc');
});
