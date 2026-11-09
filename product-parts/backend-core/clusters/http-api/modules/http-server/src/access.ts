import net from 'node:net';
import { classifyAddress } from './address.ts';

/** Methods that change state; they need a matching Origin and a JSON body. */
export const MUTATING_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Host names that are always accepted (loopback). */
const LOOPBACK_HOSTS: readonly string[] = ['127.0.0.1', 'localhost', '[::1]'];

/** Everything the access filter needs to know about one request. */
export interface AccessRequest {
  method: string;
  remoteAddress: string | undefined;
  localAddress: string | undefined;
  host: string | undefined;
  origin: string | undefined;
  contentType: string | undefined;
}

/** Facts about the server side of the connection. */
export interface AccessContext {
  /** Port the server listens on; the Host header must carry it. */
  port: number;
  /** Tailscale addresses of this machine (normalized), from the network interfaces. */
  tailscaleAddresses: readonly string[];
}

/** Result of the access filter. */
export type AccessDecision = { allowed: true } | { allowed: false; reason: string };

/** Host name and port split out of a Host header; undefined when malformed. */
export interface ParsedHost {
  hostname: string;
  port: number | undefined;
}

/** Splits a Host header into a lowercase name (IPv6 kept in brackets) and an optional port. */
export function parseHostHeader(value: string): ParsedHost | undefined {
  const text = value.trim().toLowerCase();
  const match = /^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::(\d{1,5}))?$/.exec(text);
  if (!match) return undefined;
  const hostname = match[1]!;
  if (hostname.startsWith('[') && !net.isIPv6(hostname.slice(1, -1))) return undefined;
  const port = match[2] === undefined ? undefined : Number(match[2]);
  if (port !== undefined && port > 65535) return undefined;
  return { hostname, port };
}

/** Host names accepted for any trusted client: loopback names and this machine's Tailscale addresses. */
export function allowedHostnames(ctx: AccessContext): Set<string> {
  const names = new Set<string>(LOOPBACK_HOSTS);
  for (const address of ctx.tailscaleAddresses) names.add(net.isIPv6(address) ? `[${address}]` : address);
  return names;
}

/** MagicDNS names look like <machine>.<tailnet>.ts.net. */
function isMagicDnsName(hostname: string): boolean {
  return /^([a-z0-9-]+\.)+ts\.net$/.test(hostname);
}

function deny(reason: string): AccessDecision {
  return { allowed: false, reason };
}

/** Media type of a Content-Type header without parameters, lowercase. */
function mediaType(value: string | undefined): string {
  return (value ?? '').split(';')[0]!.trim().toLowerCase();
}

/**
 * Access filter (D8): both the client address and the local socket address must be
 * loopback or Tailscale; Host must name this machine (loopback names, its Tailscale
 * addresses, *.ts.net only from a Tailscale client) with the server port; mutating
 * requests need Origin equal to http://<Host> and a JSON content type.
 */
export function checkAccess(req: AccessRequest, ctx: AccessContext): AccessDecision {
  const remoteKind = classifyAddress(req.remoteAddress);
  if (remoteKind === 'other') return deny('client address is not loopback or Tailscale');
  if (classifyAddress(req.localAddress) === 'other') return deny('local address is not loopback or Tailscale');
  if (!req.host) return deny('missing Host header');
  const host = parseHostHeader(req.host);
  if (!host) return deny('malformed Host header');
  const expectedPort = ctx.port === 80 ? [undefined, 80] : [ctx.port];
  if (!expectedPort.includes(host.port)) return deny('Host header port does not match the server port');
  const fromTailscale = remoteKind === 'tailscale';
  const knownName = allowedHostnames(ctx).has(host.hostname);
  if (!knownName && !(fromTailscale && isMagicDnsName(host.hostname))) return deny('Host header is not allowed');
  if (MUTATING_METHODS.has(req.method.toUpperCase())) {
    if (!req.origin) return deny('missing Origin header');
    if (req.origin.toLowerCase() !== `http://${req.host.trim().toLowerCase()}`) return deny('Origin does not match Host');
    if (mediaType(req.contentType) !== 'application/json') return deny('Content-Type must be application/json');
  }
  return { allowed: true };
}
