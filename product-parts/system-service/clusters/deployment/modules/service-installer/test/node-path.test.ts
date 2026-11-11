// The node of the service must survive `brew upgrade`: never the versioned Cellar path.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runServiceCommand } from '../src/index.ts';
import { homebrewOptNode } from '../src/programs.ts';
import { standardMachine } from './fakes.ts';
import type { Machine } from './fakes.ts';

const MAC_DATA = '/Users/me/Library/Application Support/Workflow Kit';
const MAC_PLIST = '/Users/me/Library/LaunchAgents/ai.workflowkit.backend.plist';
const CELLAR_NODE = '/opt/homebrew/Cellar/node@24/24.21.0/bin/node';
const OPT_NODE = '/opt/homebrew/opt/node@24/bin/node';

/** A Mac where install runs from the realpath of a Homebrew node (as process.execPath reports it). */
function cellarMachine(): Machine {
  const m = standardMachine('darwin');
  // The default fake node at /opt/homebrew/bin/node is replaced by the layout of each test.
  m.fs.files.delete('/opt/homebrew/bin/node');
  m.fs.seed(CELLAR_NODE, 'node', 0o755);
  m.deps.nodePath = CELLAR_NODE;
  return m;
}

async function installedNode(m: Machine): Promise<{ node: string; plist: string; loginPath: string }> {
  const result = await runServiceCommand('install', m.deps);
  assert.equal(result.exitCode, 0, result.message);
  const current = JSON.parse(m.fs.readTextSync(`${MAC_DATA}/app/current.json`) ?? '') as { node: string };
  const config = JSON.parse(m.fs.readTextSync(`${MAC_DATA}/config.json`) ?? '') as { programs: Record<string, string>; loginPath: string };
  assert.equal(config.programs['node'], current.node, 'config.json and current.json agree');
  return { node: current.node, plist: m.fs.readTextSync(MAC_PLIST) ?? '', loginPath: config.loginPath };
}

test('homebrewOptNode maps a Cellar node to its opt link', () => {
  assert.equal(homebrewOptNode(CELLAR_NODE), OPT_NODE);
  assert.equal(homebrewOptNode('/usr/local/Cellar/node/25.1.0/bin/node'), '/usr/local/opt/node/bin/node');
  assert.equal(homebrewOptNode('/usr/bin/node'), null);
});

test('install takes the node of the login PATH that resolves to the running Cellar node', async () => {
  const m = cellarMachine();
  m.fs.symlink('/opt/homebrew/bin/node', CELLAR_NODE);
  m.fs.symlink(OPT_NODE, CELLAR_NODE);
  const { node, plist, loginPath } = await installedNode(m);
  assert.equal(node, '/opt/homebrew/bin/node');
  assert.doesNotMatch(plist, /Cellar/);
  assert.match(plist, /<string>\/opt\/homebrew\/bin\/node<\/string>/);
  assert.doesNotMatch(m.fs.readTextSync('/Users/me/.local/bin/wfk') ?? '', /Cellar/);
  assert.equal(loginPath, '/opt/homebrew/bin:/usr/bin:/bin:/Users/me/.local/bin');
});

test('a login PATH node of another version is skipped; the Homebrew opt link is taken', async () => {
  const m = cellarMachine();
  m.fs.seed('/opt/homebrew/Cellar/node/25.1.0/bin/node', 'node', 0o755);
  m.fs.symlink('/opt/homebrew/bin/node', '/opt/homebrew/Cellar/node/25.1.0/bin/node');
  m.fs.symlink(OPT_NODE, CELLAR_NODE);
  const { node, plist, loginPath } = await installedNode(m);
  assert.equal(node, OPT_NODE);
  assert.match(plist, /<string>\/opt\/homebrew\/opt\/node@24\/bin\/node<\/string>/);
  assert.ok(loginPath.startsWith('/opt/homebrew/opt/node@24/bin:'), 'the dir of the service node goes first');
});

test('without a stable link the running node is kept', async () => {
  const m = cellarMachine();
  const { node } = await installedNode(m);
  assert.equal(node, CELLAR_NODE);
});
