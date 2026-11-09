// launchd unloads a job asynchronously (found on the user's Mac during the reinstall of T014):
// right after launchctl bootout, print still finds the old job. A start that trusts that print
// kickstarts the dying job, launchd then drops it and the service never comes back.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runServiceCommand } from '../src/index.ts';
import { seedClone, standardMachine } from './fakes.ts';

const LABEL = 'gui/501/ai.workflowkit.backend';
const PLIST = '/Users/me/Library/LaunchAgents/ai.workflowkit.backend.plist';

function launchctlLines(lines: string[]): string[] {
  return lines.filter((line) => line.startsWith('/bin/launchctl')).map((line) => line.replace('/bin/launchctl ', ''));
}

test('reinstall over a running service waits for launchd to unload the old job, then bootstraps', async () => {
  const m = standardMachine('darwin', { unloadPolls: 3 });
  assert.equal((await runServiceCommand('install', m.deps)).exitCode, 0);
  assert.ok(m.backend.health, 'first install runs the service');
  seedClone(m.fs, '/src/clone', '0.2.0');
  const before = m.lines().length;

  const update = await runServiceCommand('install', { ...m.deps, sourceRoot: '/src/clone' });
  assert.equal(update.exitCode, 0, update.message);
  assert.match(update.message, /служба: работает/);
  assert.ok(m.backend.health, 'the new version answers /api/health');
  const calls = launchctlLines(m.lines().slice(before));
  assert.equal(calls.filter((line) => line.startsWith('kickstart')).length, 0, 'no kickstart of the dying job');
  assert.equal(calls.at(-1), `bootstrap gui/501 ${PLIST}`);
  assert.ok(calls.indexOf(`bootout ${LABEL}`) < calls.lastIndexOf(`print ${LABEL}`), 'print polled after bootout');
});

test('service stop, then start right away, loads the service again', async () => {
  const m = standardMachine('darwin', { unloadPolls: 2 });
  await runServiceCommand('install', m.deps);
  assert.equal((await runServiceCommand('stop', m.deps)).message, 'служба остановлена');
  const start = await runServiceCommand('start', m.deps);
  assert.match(start.message, /^служба запущена: pid \d+/);
  assert.ok(m.backend.health);
});

test('a job launchd never unloads ends with a clear error instead of a silent dead service', async () => {
  const m = standardMachine('darwin', { unloadPolls: 1_000 });
  await runServiceCommand('install', m.deps);
  const stop = await runServiceCommand('stop', m.deps);
  assert.notEqual(stop.exitCode, 0);
  assert.match(stop.message, /launchd не выгрузил ai\.workflowkit\.backend за \d+ с после launchctl bootout; повторите wfk service start/);
});
