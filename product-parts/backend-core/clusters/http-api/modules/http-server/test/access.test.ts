import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkAccess, classifyAddress, normalizeAddress, parseHostHeader, tailscaleAddresses } from '../src/index.ts';
import type { AccessContext, AccessRequest, InterfaceMap } from '../src/index.ts';

test('addresses are classified as loopback, Tailscale or other', () => {
  const cases: Array<[string, string]> = [
    ['127.0.0.1', 'loopback'],
    ['127.10.20.30', 'loopback'],
    ['::1', 'loopback'],
    ['0:0:0:0:0:0:0:1', 'loopback'],
    ['::ffff:127.0.0.1', 'loopback'],
    ['::ffff:7f00:1', 'loopback'],
    ['100.64.0.1', 'tailscale'],
    ['100.127.255.254', 'tailscale'],
    ['::ffff:100.100.1.2', 'tailscale'],
    ['fd7a:115c:a1e0::1', 'tailscale'],
    ['fd7a:115c:a1e0:ab12:4843:cd96:6258:b240', 'tailscale'],
    ['FD7A:115C:A1E0::5%utun4', 'tailscale'],
    ['100.63.255.255', 'other'],
    ['100.128.0.1', 'other'],
    ['192.168.1.10', 'other'],
    ['::ffff:192.168.1.10', 'other'],
    ['fd7a:115c:a1e1::1', 'other'],
    ['fe80::1', 'other'],
    ['::', 'other'],
    ['not-an-ip', 'other'],
  ];
  for (const [address, kind] of cases) assert.equal(classifyAddress(address), kind, address);
  assert.equal(classifyAddress(undefined), 'other');
});

test('normalizeAddress unwraps IPv4-mapped addresses and zone ids', () => {
  assert.equal(normalizeAddress('::ffff:100.64.1.2'), '100.64.1.2');
  assert.equal(normalizeAddress('fe80::1%en0'), 'fe80::1');
  assert.equal(normalizeAddress('::1'), '::1');
});

test('tailscaleAddresses picks the Tailscale addresses from the interfaces', () => {
  const interfaces: InterfaceMap = {
    lo0: [{ address: '127.0.0.1', netmask: '255.0.0.0', family: 'IPv4', mac: '', internal: true, cidr: null }],
    en0: [{ address: '192.168.1.5', netmask: '255.255.255.0', family: 'IPv4', mac: '', internal: false, cidr: null }],
    utun4: [
      { address: '100.101.102.103', netmask: '255.255.255.255', family: 'IPv4', mac: '', internal: false, cidr: null },
      { address: 'fd7a:115c:a1e0::abcd', netmask: 'ffff::', family: 'IPv6', mac: '', internal: false, cidr: null, scopeid: 0 },
    ],
  };
  assert.deepEqual(tailscaleAddresses(interfaces), ['100.101.102.103', 'fd7a:115c:a1e0::abcd']);
});

test('parseHostHeader splits names, IPv6 literals and ports', () => {
  assert.deepEqual(parseHostHeader('127.0.0.1:4747'), { hostname: '127.0.0.1', port: 4747 });
  assert.deepEqual(parseHostHeader('[::1]:4747'), { hostname: '[::1]', port: 4747 });
  assert.deepEqual(parseHostHeader('LocalHost'), { hostname: 'localhost', port: undefined });
  assert.equal(parseHostHeader('[zz]:1'), undefined);
  assert.equal(parseHostHeader('a b:1'), undefined);
  assert.equal(parseHostHeader('host:99999'), undefined);
});

const ctx: AccessContext = { port: 4747, tailscaleAddresses: ['100.101.102.103', 'fd7a:115c:a1e0::abcd'] };

function request(overrides: Partial<AccessRequest>): AccessRequest {
  return {
    method: 'GET',
    remoteAddress: '127.0.0.1',
    localAddress: '127.0.0.1',
    host: '127.0.0.1:4747',
    origin: undefined,
    contentType: undefined,
    ...overrides,
  };
}

function reason(req: AccessRequest): string | undefined {
  const decision = checkAccess(req, ctx);
  return decision.allowed ? undefined : decision.reason;
}

test('loopback and Tailscale clients with known hosts are allowed', () => {
  assert.equal(reason(request({})), undefined);
  assert.equal(reason(request({ host: 'localhost:4747' })), undefined);
  assert.equal(reason(request({ remoteAddress: '::1', localAddress: '::1', host: '[::1]:4747' })), undefined);
  const ts = { remoteAddress: '::ffff:100.70.1.2', localAddress: '::ffff:100.101.102.103' };
  assert.equal(reason(request({ ...ts, host: '100.101.102.103:4747' })), undefined);
  assert.equal(reason(request({ ...ts, host: 'my-mac.tail1234.ts.net:4747' })), undefined);
  const ts6 = { remoteAddress: 'fd7a:115c:a1e0::9', localAddress: 'fd7a:115c:a1e0::abcd' };
  assert.equal(reason(request({ ...ts6, host: '[fd7a:115c:a1e0::abcd]:4747' })), undefined);
});

test('clients and local sockets outside loopback and Tailscale are denied', () => {
  assert.match(reason(request({ remoteAddress: '192.168.1.20' })) ?? '', /client address/);
  assert.match(reason(request({ remoteAddress: '::ffff:10.0.0.2' })) ?? '', /client address/);
  assert.match(reason(request({ remoteAddress: undefined })) ?? '', /client address/);
  assert.match(reason(request({ localAddress: '192.168.1.5' })) ?? '', /local address/);
});

test('unknown hosts, wrong ports and MagicDNS names from loopback are denied', () => {
  assert.match(reason(request({ host: undefined })) ?? '', /missing Host/);
  assert.match(reason(request({ host: 'evil.example:4747' })) ?? '', /not allowed/);
  assert.match(reason(request({ host: '127.0.0.1' })) ?? '', /port/);
  assert.match(reason(request({ host: '127.0.0.1:8080' })) ?? '', /port/);
  assert.match(reason(request({ host: 'my-mac.tail1234.ts.net:4747' })) ?? '', /not allowed/);
  assert.match(reason(request({ host: '100.99.99.99:4747' })) ?? '', /not allowed/);
});

test('mutating requests need Origin equal to http://<Host> and a JSON body', () => {
  const post = { method: 'POST', origin: 'http://127.0.0.1:4747', contentType: 'application/json; charset=utf-8' };
  assert.equal(reason(request(post)), undefined);
  for (const method of ['PUT', 'PATCH', 'DELETE']) assert.equal(reason(request({ ...post, method })), undefined);
  assert.match(reason(request({ ...post, origin: undefined })) ?? '', /missing Origin/);
  assert.match(reason(request({ ...post, origin: 'http://localhost:4747' })) ?? '', /Origin/);
  assert.match(reason(request({ ...post, origin: 'https://127.0.0.1:4747' })) ?? '', /Origin/);
  assert.match(reason(request({ ...post, origin: 'null' })) ?? '', /Origin/);
  assert.match(reason(request({ ...post, contentType: 'text/plain' })) ?? '', /Content-Type/);
  assert.match(reason(request({ ...post, contentType: undefined })) ?? '', /Content-Type/);
  assert.equal(reason(request({ method: 'GET', origin: 'http://evil.example' })), undefined);
});
