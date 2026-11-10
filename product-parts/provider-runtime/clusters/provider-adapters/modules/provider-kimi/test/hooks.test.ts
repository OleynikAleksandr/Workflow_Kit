// The Kit hook at the level of the provider: hooks(), approveHooks(), the remove action and the
// restart of the server of Kit is in hook-sync.test.ts. Everything runs in a temporary Kimi home.
import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { test } from 'node:test';
import { defaultHookHost, kimiHookBlocks, kimiHooksSection } from '#kit-structure';
import type { HookHost, KimiHookBlock } from '#kit-structure';
import type { CommandRunner, RunResult } from '#process-supervisor';
import { ProviderError } from '#provider-registry';
import type { HookState, Provider } from '#provider-registry';
import { HOOK_SCOPE_NOTE, REMOVE_HOOK_ACTION } from '../src/hooks.ts';
import { createKimiRuntime } from '../src/provider.ts';
import type { KimiDeps, KimiRuntime } from '../src/provider.ts';
import { fakeKimi } from './helpers.ts';
import type { FakeKimi } from './helpers.ts';

const FAST = { startWaitMs: 2000, stopWaitMs: 500, pollMs: 10 };
const OTHER = ['# my settings', 'default_model = "kimi/k2"', '', '[providers.kimi]', "base_url = 'https://example.test/v1'", '', '[[hooks]]', 'event = "Stop"', "command = 'python3 /home/user/hooklog.py Stop'", 'timeout = 10', ''].join('\n');

interface Bench {
  machine: FakeKimi;
  provider: Provider;
  runtime: KimiRuntime;
  /** `kimi doctor config` calls: the program and its arguments. */
  doctor: string[][];
  /** What the next `kimi doctor config` answers; null accepts the file. */
  answer: Partial<RunResult> | null;
  log: string[];
  blocks: KimiHookBlock[];
  section: string;
  file: string;
  text(): Promise<string>;
  hooks(): Promise<HookState>;
  approve(shown: { command: string; hash: string }): Promise<HookState>;
}

async function bench(run: (b: Bench) => Promise<void>, deps: KimiDeps = {}): Promise<void> {
  const machine = await fakeKimi();
  try {
    await machine.installProgram();
    const ok: RunResult = { code: 0, signal: null, stdout: '', stderr: '', timedOut: false, startError: null };
    const runCommand: CommandRunner = async (command, args) => {
      if (args[0] !== 'doctor') return { ...ok, stdout: `${machine.version}\n` };
      b.doctor.push([command, ...args]);
      return { ...ok, ...b.answer };
    };
    const context = machine.context({ runCommand, log: (line) => void b.log.push(line) });
    const wanted = kimiHookBlocks(defaultHookHost(context.env, context.homedir, context.platform));
    assert.ok(wanted.ok);
    const { runtime, provider } = createKimiRuntime(context, { ...FAST, ...deps });
    const project = await machine.project('app');
    const b: Bench = {
      machine, provider, runtime, doctor: [], answer: null, log: [], blocks: wanted.blocks, section: kimiHooksSection(wanted.blocks), file: machine.paths.config,
      text: () => readFile(machine.paths.config, 'utf8'),
      hooks: () => provider.hooks(project),
      approve: (shown) => provider.approveHooks!(project, shown),
    };
    await run(b);
  } finally {
    await machine.close();
  }
}

const refused = (code: string) => (error: unknown): boolean => error instanceof ProviderError && error.code === code && error.status === 409;
const shownOf = (state: HookState): { command: string; hash: string } => ({ command: state.kitHook!.command, hash: state.kitHook!.hash });

test('no config.toml: pending with the text to add; the approval writes exactly it', async () => {
  await bench(async (b) => {
    const before = await b.hooks();
    assert.deepEqual([before.kitHook?.status, before.kitHook?.kit, before.complete, before.note], ['pending', true, false, HOOK_SCOPE_NOTE]);
    assert.equal(before.kitHook?.command, b.section);
    assert.match(before.kitHook?.hash ?? '', /^[0-9a-f]{64}$/);
    assert.deepEqual(before.writes, [{ file: b.file, value: b.section, description: 'блоки хука Kit добавляются в конец файла' }]);
    for (const event of ['SessionStart', 'UserPromptSubmit', 'Stop', 'StopFailure', 'Interrupt']) assert.ok(b.section.includes(`event = "${event}"`));
    assert.equal(b.section.split('--client kimi').length - 1, 5);

    const after = await b.approve(shownOf(before));
    assert.deepEqual([after.kitHook?.status, after.complete, after.writes, after.note], ['approved', true, [], HOOK_SCOPE_NOTE]);
    assert.equal(await b.text(), b.section);
    assert.deepEqual(b.doctor, [[b.machine.paths.program, 'doctor', 'config']]);
    // A second approval with what is shown now changes nothing.
    await b.approve(shownOf(after));
    assert.equal(b.doctor.length, 1);
    assert.equal(b.machine.spawned.length, 0, 'the hook needs no server');
  });
});

test('the rest of config.toml and hooks of other tools stay byte for byte; the action removes only Kit blocks', async () => {
  await bench(async (b) => {
    await writeFile(b.file, OTHER);
    assert.deepEqual((await b.provider.actions(null)).map((action) => [action.id, action.enabled, action.reason]).at(-1), [REMOVE_HOOK_ACTION, false, 'хука Kit в config.toml Kimi нет']);
    await b.approve(shownOf(await b.hooks()));
    assert.equal(await b.text(), `${OTHER}\n${b.section}`);
    assert.equal((await b.hooks()).kitHook?.status, 'approved');

    const action = (await b.provider.actions(null)).at(-1)!;
    assert.deepEqual([action.id, action.title, action.scope, action.enabled], [REMOVE_HOOK_ACTION, 'Убрать хук Kit из Kimi', 'provider', true]);
    assert.match(action.confirm ?? '', /во всех проектах/);
    assert.deepEqual(await b.provider.actions(await b.machine.project('other')), []);
    await b.provider.runAction(REMOVE_HOOK_ACTION, null);
    assert.equal(await b.text(), OTHER);
    assert.equal((await b.hooks()).kitHook?.status, 'pending');
    assert.equal(b.doctor.length, 2, 'the removal is checked by kimi doctor config too');
  });
});

test('another fingerprint, another text or a file changed after the preview refuse with hooks-changed', async () => {
  await bench(async (b) => {
    await writeFile(b.file, OTHER);
    const shown = shownOf(await b.hooks());
    await assert.rejects(b.approve({ ...shown, hash: 'f'.repeat(64) }), refused('hooks-changed'));
    await assert.rejects(b.approve({ ...shown, command: `${shown.command}# more\n` }), refused('hooks-changed'));
    await writeFile(b.file, `${OTHER}# edited in the Kimi Code app\n`);
    await assert.rejects(b.approve(shown), refused('hooks-changed'));
    assert.equal(await b.text(), `${OTHER}# edited in the Kimi Code app\n`);
    assert.equal(b.doctor.length, 0);
    // The new preview is approved.
    assert.equal((await b.approve(shownOf(await b.hooks()))).kitHook?.status, 'approved');
  });
});

test('a file that changes right before the rename is kept', async () => {
  let edit: (() => Promise<void>) | null = null;
  await bench(async (b) => {
    await writeFile(b.file, OTHER);
    edit = () => writeFile(b.file, `${OTHER}# saved by Kimi\n`);
    await assert.rejects(b.approve(shownOf(await b.hooks())), refused('hooks-changed'));
    assert.equal(await b.text(), `${OTHER}# saved by Kimi\n`);
  }, { beforeRename: async () => edit?.() });
});

test('edited or partial Kit blocks are modified and are replaced by fresh ones', async () => {
  await bench(async (b) => {
    const partial = kimiHooksSection(b.blocks.slice(0, 3));
    const edited = b.section.replace('timeout = 30', 'timeout = 5');
    for (const text of [partial, edited, `${OTHER}\n${edited}`]) {
      await writeFile(b.file, text);
      const state = await b.hooks();
      assert.deepEqual([state.kitHook?.status, state.complete], ['modified', false]);
      assert.deepEqual(state.writes, [{ file: b.file, value: b.section, description: 'блоки хука Kit заменяются свежими в конце файла' }]);
      assert.equal((await b.approve(shownOf(state))).kitHook?.status, 'approved');
      assert.equal(await b.text(), text.startsWith(OTHER) ? `${OTHER}\n${b.section}` : b.section);
    }
  });
});

test('a config Kit cannot edit is unknown: no fingerprint, no write, the approval and the removal refuse', async () => {
  await bench(async (b) => {
    const cases: Array<[string | Buffer, RegExp]> = [
      ['hooks = []\n', /заданы массивом/],
      ['[hooks]\nx = 1\n', /заданы таблицей/],
      ['name = "open\n', /не разбирается/],
      [Buffer.from([0x61, 0x20, 0x3d, 0x20, 0x27, 0xff, 0x27, 0x0a]), /не в UTF-8/],
    ];
    for (const [content, reason] of cases) {
      await writeFile(b.file, content);
      const state = await b.hooks();
      assert.deepEqual([state.kitHook?.status, state.kitHook?.hash, state.complete, state.writes], ['unknown', '', null, []]);
      assert.equal(state.kitHook?.command, b.section, 'the text to add by hand is shown');
      assert.match(state.note ?? '', reason);
      assert.ok(state.note?.includes(b.file) && state.note.includes('вручную'));
      await assert.rejects(b.approve({ command: b.section, hash: '' }), refused('hooks-unknown'));
      const action = (await b.provider.actions(null)).at(-1)!;
      assert.deepEqual([action.enabled, action.reason], [false, 'Workflow Kit не меняет этот config.toml']);
      await assert.rejects(b.provider.runAction(REMOVE_HOOK_ACTION, null), refused('hooks-unknown'));
      assert.deepEqual([...(await readFile(b.file))], [...Buffer.from(content)]);
    }
    assert.equal(b.doctor.length, 0);
  });
});

test('kimi doctor config refuses or does not run: the previous file is back', async () => {
  await bench(async (b) => {
    await writeFile(b.file, OTHER);
    const answers: Array<[Partial<RunResult>, RegExp]> = [
      [{ code: 1, stderr: 'hooks.5.event: Invalid enum value\n' }, /Invalid enum value/],
      [{ code: null, startError: 'spawn ENOENT' }, /не запустился: spawn ENOENT/],
      [{ code: null, timedOut: true }, /не ответил вовремя/],
    ];
    for (const [answer, reason] of answers) {
      b.answer = answer;
      await assert.rejects(b.approve(shownOf(await b.hooks())), (error: unknown) => refused('hooks-invalid')(error) && reason.test((error as Error).message));
      assert.equal(await b.text(), OTHER);
    }
    assert.equal((await b.hooks()).kitHook?.status, 'pending');
  });
});

test('without the kimi program nothing is written and the removal is off', async () => {
  await bench(async (b) => {
    await writeFile(b.file, b.section);
    await rm(b.machine.paths.program);
    await b.provider.refresh!();
    assert.equal((await b.hooks()).kitHook?.status, 'approved', 'the file is read without the program');
    assert.deepEqual((await b.provider.actions(null)).map((action) => [action.enabled, action.reason]), Array.from({ length: 4 }, () => [false, 'Kimi Code не найден']));
    await assert.rejects(b.provider.runAction(REMOVE_HOOK_ACTION, null), (error: unknown) => error instanceof ProviderError && error.code === 'not-installed');
    await writeFile(b.file, OTHER);
    await assert.rejects(b.approve(shownOf(await b.hooks())), (error: unknown) => error instanceof ProviderError && error.code === 'not-installed');
    assert.equal(await b.text(), OTHER);
  });
});

test('Windows: the commands are quoted for cmd.exe; a path that cannot be quoted gives unknown', async () => {
  const machine = await fakeKimi();
  try {
    const context = machine.context({ platform: 'win32' });
    const project = await machine.project('app');
    const host: HookHost = { platform: 'win32', node: 'C:\\Program Files\\nodejs\\node.exe', launcher: "C:\\Users\\Д'Арк\\AppData\\Local\\Workflow Kit\\wfk.mjs" };
    const state = await createKimiRuntime(context, { ...FAST, hookHost: host }).provider.hooks(project);
    assert.equal(state.kitHook?.status, 'pending');
    assert.ok(state.kitHook?.command.includes(String.raw`command = "\"C:\\Program Files\\nodejs\\node.exe\" \"C:\\Users\\Д'Арк\\AppData\\Local\\Workflow Kit\\wfk.mjs\" hook turn-end --client kimi"`), state.kitHook?.command);
    assert.match(state.writes?.[0]?.file ?? '', /\\\.kimi-code\\config\.toml$/);
    // Without an apostrophe the command is a literal string with single backslashes.
    const plain = await createKimiRuntime(context, { ...FAST, hookHost: { ...host, launcher: 'C:\\Users\\me\\AppData\\Local\\Workflow Kit\\wfk.mjs' } }).provider.hooks(project);
    assert.ok(plain.kitHook?.command.includes(String.raw`command = '"C:\Program Files\nodejs\node.exe" "C:\Users\me\AppData\Local\Workflow Kit\wfk.mjs" hook prompt --client kimi'`));
    // The default host: the node of the service and the launcher under the home of the user.
    assert.match((await createKimiRuntime(context, FAST).provider.hooks(project)).kitHook?.command ?? '', /Workflow Kit\\+wfk\.mjs\\?" hook session-start --client kimi/);

    const bad = createKimiRuntime(context, { ...FAST, hookHost: { ...host, launcher: 'C:\\Users\\100%\\wfk.mjs' } }).provider;
    const unknown = await bad.hooks(project);
    assert.deepEqual([unknown.kitHook?.status, unknown.kitHook?.command, unknown.kitHook?.hash, unknown.complete, unknown.writes], ['unknown', '', '', null, []]);
    assert.match(unknown.note ?? '', /не может быть записан: путь «C:\\Users\\100%\\wfk\.mjs» \(wfk\.mjs\) содержит знак %/);
    await assert.rejects(bad.approveHooks!(project, { command: '', hash: '' }), refused('hooks-unknown'));
  } finally {
    await machine.close();
  }
});

test('Linux: the POSIX command of the launcher, as on macOS', async () => {
  const machine = await fakeKimi();
  try {
    const state = await createKimiRuntime(machine.context({ platform: 'linux' }), FAST).provider.hooks(await machine.project('app'));
    assert.equal(state.kitHook?.status, 'pending');
    assert.ok(state.kitHook?.command.includes(`command = '[ -x "$HOME/.local/bin/wfk" ] && "$HOME/.local/bin/wfk" hook turn-end --client kimi; exit 0'`));
    assert.match(state.writes?.[0]?.file ?? '', /\/\.kimi-code\/config\.toml$/);
  } finally {
    await machine.close();
  }
});
