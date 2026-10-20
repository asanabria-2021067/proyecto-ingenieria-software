import { Inject, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { lookup } from 'node:dns/promises';
import http, { type IncomingHttpHeaders } from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { parseMetadata, type LinkMetadata } from './html-metadata';
import { hostnameOf, isBlockedIp, LinkPreviewError, parseSafeUrl } from './url-safety';

export type LinkPreview = LinkMetadata & { url: string };
export type Address = { address: string; family: number };
export interface HopResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: AsyncIterable<Buffer | string>;
  destroy(): void;
}

const MAX_REDIRECTS = 3;
const MAX_BYTES = 512 * 1024;
const TOTAL_TIMEOUT_MS = 3000;
// ponytail: cache compartida (cache-manager global: Redis o memoria segun config); TTL corto, sin invalidacion ni tope propio.
const CACHE_TTL_MS = 10 * 60 * 1000;
const USER_AGENT = 'UVGScholarLinkPreview/1.0';

function resolveAll(hostname: string): Promise<Address[]> {
  return lookup(hostname, { all: true });
}

/** Una peticion GET conectada a la IP ya validada (la validacion y la conexion usan la misma IP). */
export function httpTransport(url: URL, target: Address, signal: AbortSignal): Promise<HopResponse> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(
      url,
      {
        method: 'GET',
        signal,
        agent: false,
        // El nombre sigue siendo el original (SNI, certificado y Host); solo se fija la IP.
        lookup: (_host, options, cb) =>
          options.all
            ? (cb as unknown as (e: null, a: Address[]) => void)(null, [target])
            : cb(null, target.address, target.family),
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html', 'Accept-Encoding': 'identity' },
      },
      (res) =>
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body: res, destroy: () => res.destroy() }),
    );
    req.on('error', reject);
    req.end();
  });
}

@Injectable()
export class LinkPreviewService {
  // Reemplazables en pruebas.
  resolver: (hostname: string) => Promise<Address[]> = resolveAll;
  transport: (url: URL, target: Address, signal: AbortSignal) => Promise<HopResponse> = httpTransport;

  constructor(@Inject(CACHE_MANAGER) private cache: Cache) {}

  async preview(rawUrl: string): Promise<LinkPreview> {
    const key = `link-preview:${rawUrl}`;
    const cached = await this.cache.get<LinkPreview>(key).catch(() => undefined);
    if (cached) return cached;
    let result: LinkPreview;
    try {
      const { html, url } = await this.fetchHtml(rawUrl);
      result = { url: url.href, ...parseMetadata(html, url) };
    } catch {
      // Mensaje unico: no se filtra si fue DNS, IP privada o puerto (evita usarlo como escaner).
      throw new UnprocessableEntityException('No se pudo generar la vista previa');
    }
    await this.cache.set(key, result, CACHE_TTL_MS).catch(() => undefined);
    return result;
  }

  async fetchHtml(rawUrl: string): Promise<{ html: string; url: URL }> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TOTAL_TIMEOUT_MS);
    try {
      let url = parseSafeUrl(rawUrl);
      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        const target = await this.resolveSafe(url, ctrl.signal);
        const res = await this.transport(url, target, ctrl.signal);
        const location = res.headers.location;
        if (res.status >= 300 && res.status < 400 && location) {
          res.destroy();
          url = parseSafeUrl(new URL(location, url).href); // se revalida esquema, puerto e IP en cada salto
          continue;
        }
        if (res.status !== 200 || !/^text\/html\b/i.test(res.headers['content-type'] ?? '')) {
          res.destroy();
          throw new LinkPreviewError('content-type');
        }
        return { html: await readLimited(res), url };
      }
      throw new LinkPreviewError('redirects');
    } catch (e) {
      if (e instanceof LinkPreviewError) throw e;
      throw new LinkPreviewError(ctrl.signal.aborted ? 'timeout' : 'network');
    } finally {
      clearTimeout(timer);
    }
  }

  /** Resuelve el DNS y exige que TODAS las direcciones sean publicas; devuelve la que se usara para conectar. */
  private async resolveSafe(url: URL, signal: AbortSignal): Promise<Address> {
    const host = hostnameOf(url);
    const kind = isIP(host);
    const addresses = kind
      ? [{ address: host, family: kind }]
      : await Promise.race([
          this.resolver(host),
          new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(new LinkPreviewError('timeout')))),
        ]).catch((e) => {
          throw e instanceof LinkPreviewError ? e : new LinkPreviewError('dns');
        });
    if (addresses.length === 0) throw new LinkPreviewError('dns');
    if (addresses.some((a) => isBlockedIp(a.address))) throw new LinkPreviewError('blocked-ip');
    return addresses[0];
  }
}

async function readLimited(res: HopResponse): Promise<string> {
  const declared = Number(res.headers['content-length']);
  if (declared > MAX_BYTES) {
    res.destroy();
    throw new LinkPreviewError('too-large');
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of res.body) {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    size += buf.length;
    if (size > MAX_BYTES) {
      res.destroy();
      throw new LinkPreviewError('too-large');
    }
    chunks.push(buf);
  }
  // ponytail: se asume UTF-8; paginas en otros charsets saldran con caracteres raros, se descartan por falla cerrada.
  return Buffer.concat(chunks).toString('utf8');
}
