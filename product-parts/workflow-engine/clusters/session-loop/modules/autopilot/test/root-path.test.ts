// M39 F002: the project root of a host ticket. The service and the Kit child may name the same
// folder differently; on Windows by the 8.3 short name, the case, the slashes and a trailing
// separator. The platform is injected; the real folder check runs on every OS in CI.
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createHostTickets, hostInputDigest, rootKey, sameRoot } from '../src/index.ts';
import type { HostBinding } from '../src/index.ts';

test('win32: case, slashes, a trailing separator and the long-path prefix name the same root', () => {
  const root = 'C:\\Users\\runneradmin\\AppData\\Local\\Temp\\wfk-1\\life';
  for (const other of [
    'c:/users/runneradmin/appdata/local/temp/wfk-1/life',
    'C:\\Users\\RunnerAdmin\\AppData\\Local\\Temp\\wfk-1\\life\\',
    '\\\\?\\C:\\Users\\runneradmin\\AppData\\Local\\Temp\\wfk-1\\life',
  ]) assert.equal(sameRoot(root, other, 'win32'), true, other);
  assert.equal(sameRoot(root, 'C:\\Users\\runneradmin\\AppData\\Local\\Temp\\wfk-1\\late', 'win32'), false);
  assert.equal(rootKey('\\\\?\\UNC\\server\\share\\p', 'win32'), '\\\\?\\unc\\server\\share\\p', 'a UNC long path keeps its prefix');
});

test('linux and darwin: the case matters, a trailing slash does not', () => {
  assert.equal(sameRoot('/home/u/Project', '/home/u/project', 'linux'), false);
  assert.equal(sameRoot('/home/u/project/', '/home/u/project', 'linux'), true);
  assert.equal(sameRoot('/Users/u/p', '/Users/u/p/', 'darwin'), true);
  assert.equal(rootKey('/', 'linux'), '/');
});

test('a real folder: the native realpath joins its aliases (macOS /var → /private/var, Windows 8.3 names)', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-root-'));
  try {
    const real = realpathSync.native(tmp);
    assert.equal(sameRoot(tmp, real), true);
    assert.equal(sameRoot(tmp, path.join(tmp, 'other')), false);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('a ticket on win32 accepts the root the Kit names in another form, and refuses another project', () => {
  const tickets = createHostTickets({ platform: 'win32' });
  const bound: HostBinding = { operation: 'accept', root: 'C:\\Users\\RUNNER~1\\Temp\\p', runId: 'r', scopeId: 's', ownerSession: 'o', expectedRevision: 3, inputDigest: 'd' };
  const request = (verifier: { ticket: string }, payload: unknown) => ({ payload, payloadDigest: hostInputDigest(payload), ticket: verifier.ticket });
  const first = tickets.issue(bound);
  assert.deepEqual(first.verify(request(first, { ...bound, root: 'c:/users/runner~1/temp/p' })), { ok: true });
  const second = tickets.issue(bound);
  assert.deepEqual(second.verify(request(second, { ...bound, root: 'C:\\Users\\RUNNER~1\\Temp\\q' })), { ok: false, reason: 'ticket bound to another root' });
  const linux = createHostTickets({ platform: 'linux' }).issue({ ...bound, root: '/tmp/P' });
  assert.deepEqual(linux.verify(request(linux, { ...bound, root: '/tmp/p' })), { ok: false, reason: 'ticket bound to another root' });
});
