// M45 T004: the 19.11.2026 cases on the parameter host with the loop of interrupt-worker.ts
// (legacy file → userInput, poll without discovery, write the action, yieldToUser holds the file)
// and a simulated Claude terminal: CLI 2.1.328 with a catalog cached for 2.1.325, so the host opens
// /model to read the catalog.
//  1. A panel message (.text) arrives while the /model menu is open: the menu is closed first and
//     the text goes only into an idle, empty input — never into the menu or after the command.
//  2. A Remote Control message (the Ingress line of the debug file) arrives while the menu is open:
//     the menu is closed within one poll, not after 55 s.
//  3. The input keeps text the host did not type (the user's draft after /model): the text waits
//     and is not pasted while the terminal is unclean, at most 10 s.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { TerminalScreen } from '#pty-host';
import { ParameterHost } from '../src/pty/parameter-files.ts';
import { NATIVE_KEYS, PARAMETER_CATALOG, PARAMETER_NATIVE } from '../src/pty/parameter-protocol.ts';
import type { NativeAction, NativeMetadata } from '../src/pty/parameter-protocol.ts';

const hostId = randomUUID(); const sessionId = randomUUID();
const DEBUG = '/logs/session-20261119T090146-d4902d.debug.log';
const idle = (input = '') => `────────────────────────\r\n❯ ${input}\r\n────────────────────────\r\n  ⏵⏵ auto mode on (shift+tab to cycle)`;
const MENU = 'Select model\r\n❯ 1. Default\r\n  2. Opus 5.5  Most capable\r\nEnter to set as default · s for this session only · Esc to cancel';
const OLD_CATALOG = { version: 1, cliVersion: '2.1.325', primaryLast: 5, models: [{ key: 'native:Opus%205.5', label: 'Opus 5.5', group: 'primary', index: 2 }], efforts: {} };

function world(input: (typed: string) => string = () => '') {
  let now = 1_795_078_900_000;
  let log = Buffer.from('2026-11-19T09:01:46.000Z [DEBUG] start\n');
  const screen = new TerminalScreen();
  const meta: NativeMetadata = { version: 1, hostId, sessionId, cwd: '/project', cliVersion: '2.1.328', model: { id: 'claude-opus-5-5', label: 'Opus 5.5' }, effort: 'high', fast: false, at: now };
  const host = new ParameterHost(DEBUG, hostId, '/project', screen, {
    read: async (file) => (file === DEBUG + PARAMETER_NATIVE ? JSON.stringify({ ...meta, at: now - 10 }) : file === DEBUG + PARAMETER_CATALOG ? JSON.stringify(OLD_CATALOG) : null),
    take: async () => null, put: async () => undefined,
    size: async () => log.length, slice: async (_f, start, end) => log.subarray(start, end).toString('utf8'),
  }, () => now);
  const sim = { menu: false, typed: '', pasted: [] as string[] };
  const render = () => { screen.feed(`\x1b[2J\x1b[H${'\r\n'.repeat(30)}${sim.menu ? MENU : idle(input(sim.typed))}`); host.observe(); };
  render();
  /** Claude's answer to one key or text of the host. */
  const apply = (action: NativeAction) => {
    const value = action.kind === 'text' ? action.value : NATIVE_KEYS[action.value as keyof typeof NATIVE_KEYS];
    if (action.kind === 'text') sim.typed += value;
    else if (value === '\r' && sim.typed === '/model') { sim.menu = true; sim.typed = ''; }
    else if (value === '\x1b') sim.menu = false;
    else if (value === '\x15') sim.typed = '';
    render();
  };
  /** One POLL of interrupt-worker.ts; true when the user's file may go now. */
  const poll = async (legacy: boolean): Promise<boolean> => {
    now += 250;
    if (legacy) host.userInput();
    const action = await host.poll(!legacy);
    if (action) host.write(action, () => { apply(action); return true; });
    return !(legacy ? host.engine.yieldToUser() : host.busy);
  };
  const openMenu = async () => {
    for (let i = 0; i < 20 && !sim.menu; i++) await poll(false);
    assert.equal(sim.menu, true, 'the host opened /model for the catalog of 2.1.328');
  };
  const paste = (text: string) => { assert.equal(sim.menu, false, 'never into the menu'); assert.equal(input(sim.typed), '', 'never after a command'); sim.pasted.push(text); };
  return { sim, poll, openMenu, paste, advance: (ms: number) => { now += ms; }, ingress: () => { log = Buffer.concat([log, Buffer.from('2026-11-19T09:05:41.482Z [DEBUG] [bridge:repl] Ingress message type=user uuid=90e59071\n')]); } };
}

test('19.11, case 1: a panel message while the /model menu is open goes only into a clean input', async () => {
  const w = world((typed) => typed);
  await w.openMenu();
  let polls = 0;
  while (!(await w.poll(true))) { polls += 1; assert.ok(polls < 40, 'the text is held at most a few seconds'); }
  w.paste('Составь спецификацию и план');
  assert.deepEqual(w.sim.pasted, ['Составь спецификацию и план']);
});

test('19.11, case 2: a Remote Control message closes the menu of the host within one poll', async () => {
  const w = world((typed) => typed);
  await w.openMenu();
  w.ingress();
  await w.poll(false);
  assert.equal(w.sim.menu, false, 'Esc right after the Ingress line');
  for (let i = 0; i < 8; i++) { await w.poll(false); assert.equal(w.sim.menu, false, 'no new discovery while Claude takes the message'); }
});

test('19.11, case 3: text the host did not type is never cleared and the panel text waits for at most 10 s', async () => {
  // The user typed after the host's /model: «/model foreign draft» is not the host's command.
  const w = world((typed) => (typed === '/model' ? '/model foreign draft' : typed));
  for (let i = 0; i < 6; i++) await w.poll(false);
  let held = 0;
  while (!(await w.poll(true))) { held += 1; if (held > 60) break; }
  assert.ok(held >= 4, 'the text waited while the input was unclean');
  w.advance(10_000);
  assert.equal(await w.poll(true), true, 'after 10 s the text goes as before');
  assert.equal(w.sim.typed, '/model', 'the foreign draft was never cleared');
});
