// runHostProcess (M39): the parent end of the host ticket protocol, with small child scripts.
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { HOST_PROTOCOL, type HostVerifier, runHostProcess } from '../src/index.ts';

let tmp = '';

// The child: hello, then verify with the ticket it got, then print the verdict as JSON.
const CHILD = `
const requestId = 'req-1';
process.on('message', (m) => {
  if (m.type === 'wfk-host-ticket') {
    process.send({ protocol: '${HOST_PROTOCOL}', requestId: process.argv[2] === 'foreign' ? 'other' : requestId, type: 'wfk-host-verify', ticket: m.ticket, payload: { a: 1 }, payloadDigest: 'd' });
    if (process.argv[2] === 'foreign') setTimeout(() => { process.stdout.write(JSON.stringify({ seen: m.ticket.length > 0 })); process.disconnect(); }, 100);
  }
  if (m.type === 'wfk-host-verdict') { process.stdout.write(JSON.stringify(m)); process.disconnect(); }
});
process.send({ protocol: '${HOST_PROTOCOL}', requestId, type: 'wfk-host-hello' });
process.send({ protocol: '${HOST_PROTOCOL}', requestId: 'second', type: 'wfk-host-hello' });
if (process.argv[2] === 'hang') setInterval(() => {}, 1000);
`;

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-host-run-'));
  await writeFile(path.join(tmp, 'child.mjs'), CHILD);
});

after(async () => {
  await rm(tmp, { recursive: true, force: true });
});

function verifier(verdict: ReturnType<HostVerifier['verify']>, seen: unknown[]): HostVerifier {
  return {
    ticket: 'secret',
    verify: (request) => {
      seen.push(request);
      return verdict;
    },
  };
}

const run = (args: string[], host: HostVerifier, timeoutMs = 10_000) =>
  runHostProcess({ args, bundle: path.join(tmp, 'child.mjs'), cwd: tmp, env: { PATH: process.env['PATH'] }, maxBytes: 4096, nodePath: process.execPath, timeoutMs, verifier: host });

test('the parent sends the ticket to the first hello and the verdict to its verify', async () => {
  const seen: unknown[] = [];
  const result = await run([], verifier({ ok: true }, seen));
  assert.equal(result.startError, null);
  assert.equal(result.timedOut, false);
  assert.deepEqual(JSON.parse(result.stdout), { ok: true, protocol: HOST_PROTOCOL, requestId: 'req-1', type: 'wfk-host-verdict' });
  assert.deepEqual(seen, [{ payload: { a: 1 }, payloadDigest: 'd', ticket: 'secret' }]);
  const refusedSeen: unknown[] = [];
  const refused = await run([], verifier({ ok: false, reason: 'ticket expired' }, refusedSeen));
  assert.deepEqual(JSON.parse(refused.stdout), { ok: false, protocol: HOST_PROTOCOL, reason: 'ticket expired', requestId: 'req-1', type: 'wfk-host-verdict' });
});

test('a verify of another request id is not answered; a hanging child is stopped', async () => {
  const seen: unknown[] = [];
  const foreign = await run(['foreign'], verifier({ ok: true }, seen));
  assert.deepEqual(JSON.parse(foreign.stdout), { seen: true });
  assert.deepEqual(seen, []);
  const hang = await run(['hang'], verifier({ ok: true }, []), 1500);
  assert.equal(hang.timedOut, true);
});
