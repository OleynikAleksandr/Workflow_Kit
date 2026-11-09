import net from 'node:net';
import type os from 'node:os';

/** Network interfaces in the shape of os.networkInterfaces(); injected for tests. */
export type InterfaceMap = NodeJS.Dict<os.NetworkInterfaceInfo[]>;

/** Classification of an address for the access filter (D8). */
export type AddressKind = 'loopback' | 'tailscale' | 'other';

/** Parses an IPv4 address into four octets, or undefined. */
function ipv4Octets(address: string): number[] | undefined {
  if (!net.isIPv4(address)) return undefined;
  return address.split('.').map(Number);
}

/** Expands an IPv6 address (with optional embedded IPv4) into eight 16-bit groups, or undefined. */
export function expandIPv6(address: string): number[] | undefined {
  if (!net.isIPv6(address)) return undefined;
  let text = address.toLowerCase();
  const tail: number[] = [];
  const lastColon = text.lastIndexOf(':');
  const maybeV4 = ipv4Octets(text.slice(lastColon + 1));
  if (maybeV4) {
    const [a = 0, b = 0, c = 0, d = 0] = maybeV4;
    tail.push((a << 8) | b, (c << 8) | d);
    const prefix = text.slice(0, lastColon + 1);
    text = prefix.endsWith('::') ? prefix : prefix.slice(0, -1);
  }
  const [head = '', rest] = text.split('::');
  const parse = (part: string): number[] => (part === '' ? [] : part.split(':').map((g) => Number.parseInt(g, 16)));
  const left = parse(head);
  const right = rest === undefined ? [] : parse(rest);
  const missing = 8 - tail.length - left.length - right.length;
  if (rest === undefined && missing !== 0) return undefined;
  if (missing < 0) return undefined;
  return [...left, ...new Array<number>(missing).fill(0), ...right, ...tail];
}

/**
 * Normalizes a socket address: drops the IPv6 zone id, lowercases and turns an
 * IPv4-mapped IPv6 address (::ffff:a.b.c.d) into plain IPv4.
 */
export function normalizeAddress(address: string): string {
  const text = address.split('%')[0]!.toLowerCase();
  const groups = expandIPv6(text);
  if (groups && groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    const hi = groups[6] ?? 0;
    const lo = groups[7] ?? 0;
    return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
  }
  return text;
}

/** Classifies an address: loopback (127.0.0.0/8, ::1), Tailscale (100.64.0.0/10, fd7a:115c:a1e0::/48) or other. */
export function classifyAddress(address: string | undefined): AddressKind {
  if (!address) return 'other';
  const normalized = normalizeAddress(address);
  const v4 = ipv4Octets(normalized);
  if (v4) {
    if (v4[0] === 127) return 'loopback';
    if (v4[0] === 100 && (v4[1] ?? 0) >= 64 && (v4[1] ?? 0) <= 127) return 'tailscale';
    return 'other';
  }
  const v6 = expandIPv6(normalized);
  if (!v6) return 'other';
  if (v6.slice(0, 7).every((g) => g === 0) && v6[7] === 1) return 'loopback';
  if (v6[0] === 0xfd7a && v6[1] === 0x115c && v6[2] === 0xa1e0) return 'tailscale';
  return 'other';
}

/** True for loopback and Tailscale addresses, the only ones the service talks to. */
export function isTrustedAddress(address: string | undefined): boolean {
  return classifyAddress(address) !== 'other';
}

/** Tailscale addresses of this machine found on its network interfaces (normalized, unique). */
export function tailscaleAddresses(interfaces: InterfaceMap): string[] {
  const found = new Set<string>();
  for (const list of Object.values(interfaces)) {
    for (const info of list ?? []) {
      if (classifyAddress(info.address) === 'tailscale') found.add(normalizeAddress(info.address));
    }
  }
  return [...found];
}
