// A stand-in for the `codex` CLI used by the tests (never the real one):
//   fake-codex app-server              JSON-RPC over stdio: initialize, hooks/list, config/value/write
//   fake-codex --version               prints a version
//   fake-codex remote-control start    prints FAKE_RC_OUTPUT
//   fake-codex remote-control stop     exits 0
// State lives in $CODEX_HOME (config.toml) and every request is appended to $CODEX_HOME/calls.jsonl.
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';

const home = process.env.CODEX_HOME;
const configFile = path.join(home, 'config.toml');
const config = () => (existsSync(configFile) ? readFileSync(configFile, 'utf8') : '');
const log = (entry) => appendFileSync(path.join(home, 'calls.jsonl'), JSON.stringify(entry) + '\n');
const snake = (event) => event.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

const [command, sub] = process.argv.slice(2);
if (command === '--version') {
  process.stdout.write('codex-cli 9.9.9\n');
  process.exit(0);
}
if (command === 'remote-control' && sub === 'start') {
  log({ argv: process.argv.slice(2) });
  process.stdout.write((process.env.FAKE_RC_OUTPUT ?? '{"mode":"daemon","status":"connected"}') + '\n');
  process.exit(0);
}
if (command === 'remote-control' && sub === 'stop') {
  log({ argv: process.argv.slice(2) });
  process.exit(0);
}
if (command !== 'app-server') process.exit(2);

function trusted(cwd) {
  return config().includes(`[projects."${cwd}"]\ntrust_level = "trusted"`);
}

function hooksOf(cwd) {
  const file = path.join(cwd, '.codex', 'hooks.json');
  if (!trusted(cwd) || !existsSync(file)) return [];
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  const result = [];
  for (const [event, groups] of Object.entries(parsed.hooks ?? {})) {
    groups.forEach((group, g) =>
      group.hooks.forEach((hook, i) => {
        const key = `${file}:${snake(event)}:${g}:${i}`;
        const currentHash = 'sha256:' + createHash('sha256').update(hook.command).digest('hex');
        const stored = /trusted_hash = "([^"]*)"/.exec(config().split(`[hooks.state."${key}"]`)[1] ?? '')?.[1];
        const trustStatus = stored === undefined ? 'untrusted' : stored === currentHash ? 'trusted' : 'modified';
        result.push({ key, eventName: event, handlerType: 'command', command: hook.command, sourcePath: file, source: 'project', currentHash, trustStatus });
      }),
    );
  }
  return result;
}

const send = (message) => process.stdout.write(JSON.stringify(message) + '\n');
createInterface({ input: process.stdin }).on('line', (line) => {
  const message = JSON.parse(line);
  log({ method: message.method, params: message.params, cwd: process.cwd() });
  if (message.id === undefined) return;
  if (message.method === 'initialize') {
    send({ method: 'remoteControl/status/changed', params: { status: 'disabled', serverName: 'fake' } });
    send({ id: message.id, result: { userAgent: 'fake/9.9.9', codexHome: home, platformOs: 'macos' } });
  } else if (message.method === 'hooks/list') {
    send({ id: message.id, result: { data: message.params.cwds.map((cwd) => ({ cwd, hooks: hooksOf(cwd), warnings: [], errors: [] })) } });
  } else if (message.method === 'config/value/write') {
    if (process.env.FAKE_WRITE_IGNORED !== '1') {
      const match = /^(projects|hooks\.state)\.("[^"]*")\.(trust_level|trusted_hash)$/.exec(message.params.keyPath);
      appendFileSync(configFile, `\n[${match[1]}.${match[2]}]\n${match[3]} = ${JSON.stringify(message.params.value)}\n`);
    }
    send({ id: message.id, result: { status: 'ok', version: 'v1', filePath: configFile } });
  } else {
    send({ id: message.id, error: { code: -32601, message: `unknown method ${message.method}` } });
  }
});
