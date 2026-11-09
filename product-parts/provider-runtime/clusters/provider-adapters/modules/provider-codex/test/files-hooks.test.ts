import assert from 'node:assert/strict';
import { test } from 'node:test';
import { codexPaths, hookTrustKeyPath, parseSessionIndex, projectTrustLevel, tokenErrorLine, trustKeyPath } from '../src/codex-files.ts';
import { KIT_HOOK_COMMAND, buildHookState, hookStatus, listedProjectHooks, localHooks, snakeEvent } from '../src/hooks.ts';
import { parseRemoteControlStart } from '../src/provider.ts';
import { threadLinks } from '../src/sessions.ts';

test('trust_level is read from tables, dotted keys and inline tables; other folders do not count', () => {
  const text = [
    'model = "x"',
    '[projects."/"]',
    'trust_level = "trusted"',
    '',
    '[projects."/Users/me/A"] # comment',
    'trust_level = "untrusted"',
    '[projects."/Users/me/B"]',
    "trust_level = 'trusted'",
    '[projects]',
    '"/Users/me/C".trust_level = "trusted"',
    '"/Users/me/D" = { trust_level = "trusted" }',
    '[other]',
    'trust_level = "trusted"',
  ].join('\n');
  assert.equal(projectTrustLevel(text, '/Users/me/A'), 'untrusted');
  assert.equal(projectTrustLevel(text, '/Users/me/B'), 'trusted');
  assert.equal(projectTrustLevel(text, '/Users/me/C'), 'trusted');
  assert.equal(projectTrustLevel(text, '/Users/me/D'), 'trusted');
  assert.equal(projectTrustLevel(text, '/Users/me'), null, 'trust of / or the home folder does not help');
  assert.equal(projectTrustLevel('[projects."/Users/Проект"]\ntrust_level = "trusted"\n', '/Users/Проект'), 'trusted');
});

test('config keys are quoted, unsafe paths are refused; CODEX_HOME is respected', () => {
  assert.equal(trustKeyPath('/Users/me/My Project'), 'projects."/Users/me/My Project".trust_level');
  assert.equal(hookTrustKeyPath('/p/.codex/hooks.json:session_start:0:0'), 'hooks.state."/p/.codex/hooks.json:session_start:0:0".trusted_hash');
  assert.throws(() => trustKeyPath('/Users/me/a"b'), /cannot quote/);
  assert.throws(() => trustKeyPath('/Users/me/a\\b'), /cannot quote/);
  assert.equal(codexPaths('/home/u', {}).config, '/home/u/.codex/config.toml');
  assert.equal(codexPaths('/home/u', { CODEX_HOME: '/opt/cx' }).controlSocket, '/opt/cx/app-server-control/app-server-control.sock');
  assert.equal(codexPaths('/home/u', { CODEX_HOME: 'relative' }).home, '/home/u/.codex');
});

test('session names: the last line of an id wins, broken lines are skipped', () => {
  const names = parseSessionIndex('{"id":"a","thread_name":"Old"}\nnot json\n{"id":"b","thread_name":"B"}\n{"id":"a","thread_name":"New","updated_at":"x"}\n');
  assert.deepEqual([...names], [['a', 'New'], ['b', 'B']]);
});

test('token errors are found in the daemon log; remote-control output is parsed', () => {
  const log = '\u001b[2m2026\u001b[0m ERROR failed: request timed out\nERROR remote control: 401 Unauthorized: token expired\nINFO ok\n';
  assert.match(tokenErrorLine(log) ?? '', /401 Unauthorized: token expired/);
  assert.equal(tokenErrorLine('ERROR request timed out\n'), null);
  assert.deepEqual(parseRemoteControlStart('{"mode":"daemon","status":"connected","serverName":"mac"}\n'), { status: 'connected', serverName: 'mac', error: null });
  assert.equal(parseRemoteControlStart('Error: connection is errored\n').error, 'Error: connection is errored');
});

test('links are codex://threads/<id> for safe ids only', () => {
  assert.deepEqual(threadLinks('019a-01'), { desktop: 'codex://threads/019a-01', mobile: 'codex://threads/019a-01' });
  assert.deepEqual(threadLinks('../x?y'), {});
});

const FILE = '/p/.codex/hooks.json';
const config = {
  hooks: {
    SessionStart: [
      { hooks: [{ type: 'command', command: 'echo foreign' }] },
      { hooks: [{ type: 'command', command: KIT_HOOK_COMMAND }] },
    ],
    UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'echo prompt' }] }],
  },
};

test('hooks: positional keys, Kit hook first, foreign hooks with hash, completeness', () => {
  assert.equal(snakeEvent('UserPromptSubmit'), 'user_prompt_submit');
  const local = { text: '{}', hooks: localHooks(FILE, config), error: null };
  assert.deepEqual(local.hooks.map((h) => h.key), [`${FILE}:session_start:0:0`, `${FILE}:session_start:1:0`, `${FILE}:user_prompt_submit:0:0`]);
  const listed = listedProjectHooks({
    data: [{
      cwd: '/p',
      hooks: [
        { key: '/home/.codex/hooks.json:session_start:0:0', sourcePath: '/home/.codex/hooks.json', command: 'global', currentHash: 'g', trustStatus: 'trusted' },
        { key: `${FILE}:session_start:0:0`, sourcePath: FILE, command: 'echo foreign', currentHash: 'sha256:f', trustStatus: 'untrusted' },
        { key: `${FILE}:session_start:1:0`, sourcePath: FILE, command: KIT_HOOK_COMMAND, currentHash: 'sha256:k', trustStatus: 'trusted' },
      ],
    }],
  }, '/p');
  assert.equal(listed.length, 2, 'global hooks of the user are not project hooks');
  const state = buildHookState({ local, listed, trusted: true });
  assert.equal(state.kitHook?.hash, 'sha256:k');
  assert.equal(state.kitHook?.status, 'approved');
  assert.equal(state.complete, true);
  assert.deepEqual(state.hooks.map((h) => [h.command, h.hash, h.status, h.kit]), [
    ['echo foreign', 'sha256:f', 'pending', false],
    ['echo prompt', '', 'unknown', false],
  ]);
  const pending = buildHookState({ local, listed: listed.map((h) => ({ ...h, trustStatus: 'untrusted' })), trusted: true });
  assert.equal(pending.complete, false);
  assert.match(pending.note ?? '', /не одобрен.*список сессий неполон/);
  const untrusted = buildHookState({ local, listed: null, trusted: false });
  assert.equal(untrusted.complete, false);
  assert.match(untrusted.note ?? '', /не доверена/);
  const none = buildHookState({ local: { text: null, hooks: [], error: null }, listed: null, trusted: true });
  assert.equal(none.kitHook, null);
  assert.match(none.note ?? '', /хук Kit не установлен/);
  const edited = localHooks(FILE, { hooks: { SessionStart: [{ hooks: [{ type: 'command', command: `${KIT_HOOK_COMMAND} --x` }] }] } });
  const editedState = buildHookState({ local: { text: '{}', hooks: edited, error: null }, listed: null, trusted: true });
  assert.equal(editedState.kitHook, null, 'a changed command is not the Kit hook');
  assert.match(editedState.note ?? '', /изменена вручную/);
  assert.deepEqual(['trusted', 'managed', 'untrusted', 'modified', 'x'].map(hookStatus), ['approved', 'approved', 'pending', 'modified', 'unknown']);
});
