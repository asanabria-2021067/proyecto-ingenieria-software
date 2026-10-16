import { isIP } from 'node:net';

export type LinkPreviewReason =
  | 'invalid-url'
  | 'scheme'
  | 'credentials'
  | 'port'
  | 'blocked-ip'
  | 'dns'
  | 'redirects'
  | 'content-type'
  | 'too-large'
  | 'timeout'
  | 'network';

export class LinkPreviewError extends Error {
  constructor(readonly reason: LinkPreviewReason) {
    super(reason);
  }
}

const ALLOWED_PORTS = new Set(['', '80', '443']);

// [base, prefijo] de rangos IPv4 que nunca deben alcanzarse desde el servidor.
const BLOCKED_V4: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16], // link-local + metadata cloud (169.254.169.254)
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reservado + broadcast
];

function v4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, part) => acc * 256 + Number(part), 0);
}

function isBlockedV4(ip: string): boolean {
  const n = v4ToInt(ip);
  return BLOCKED_V4.some(([base, prefix]) => {
    const start = v4ToInt(base);
    return n >= start && n < start + 2 ** (32 - prefix);
  });
}

/** Expande una IPv6 valida a 8 grupos de 16 bits (acepta sufijo IPv4). */
function expandV6(ip: string): number[] {
  let text = ip;
  const tail = text.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (tail) {
    const n = v4ToInt(tail[1]);
    text = text.slice(0, -tail[1].length) + `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const [head, rest] = text.split('::');
  const a = head ? head.split(':') : [];
  const b = rest ? rest.split(':') : [];
  const fill = rest === undefined ? [] : Array(8 - a.length - b.length).fill('0');
  return [...a, ...fill, ...b].map((g) => parseInt(g, 16));
}

function v4FromGroups(hi: number, lo: number): string {
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}

function isBlockedV6(ip: string): boolean {
  const g = expandV6(ip);
  // ::ffff:a.b.c.d (IPv4-mapped) y ::a.b.c.d (IPv4-compatible): se evalua la IPv4 embebida.
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) {
    return isBlockedV4(v4FromGroups(g[6], g[7]));
  }
  // NAT64 64:ff9b::/96 y 6to4 2002::/16 llevan una IPv4 embebida.
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) {
    return isBlockedV4(v4FromGroups(g[6], g[7]));
  }
  if (g[0] === 0x2002) return isBlockedV4(v4FromGroups(g[1], g[2]));
  // Solo unicast global 2000::/3, menos Teredo, 2001:db8::/32 y 2001:10::/28.
  if ((g[0] & 0xe000) !== 0x2000) return true;
  if (g[0] === 0x2001 && (g[1] === 0 || g[1] === 0xdb8 || (g[1] & 0xfff0) === 0x10)) return true;
  return false;
}

/** true si la IP (v4 o v6, en texto) no debe contactarse. Lo no parseable se bloquea. */
export function isBlockedIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isBlockedV4(ip);
  if (kind === 6) return isBlockedV6(ip);
  return true;
}

/** Valida esquema, credenciales y puerto. Devuelve la URL parseada o lanza LinkPreviewError. */
export function parseSafeUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new LinkPreviewError('invalid-url');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new LinkPreviewError('scheme');
  if (url.username || url.password) throw new LinkPreviewError('credentials');
  if (!ALLOWED_PORTS.has(url.port)) throw new LinkPreviewError('port');
  return url;
}

/** Hostname sin los corchetes de una IPv6 literal. */
export function hostnameOf(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, '');
}
