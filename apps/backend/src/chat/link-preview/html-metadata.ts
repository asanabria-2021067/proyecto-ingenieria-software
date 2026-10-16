export interface LinkMetadata {
  titulo: string | null;
  descripcion: string | null;
  imagen: string | null;
  sitio: string | null;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decode(text: string): string {
  return text.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (m, dec, hex, name) => {
    if (name) return ENTITIES[name.toLowerCase()] ?? m;
    const code = dec ? Number(dec) : parseInt(hex, 16);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
  });
}

/** Texto plano: decodifica entidades, quita etiquetas y controles, colapsa espacios y recorta. */
export function cleanText(raw: string | undefined, max: number): string | null {
  if (!raw) return null;
  const text = decode(raw)
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function metaTags(html: string): Map<string, string> {
  const metas = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs = new Map<string, string>();
    for (const m of tag.matchAll(/([a-zA-Z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
      attrs.set(m[1].toLowerCase(), m[2] ?? m[3] ?? m[4] ?? '');
    }
    const key = (attrs.get('property') ?? attrs.get('name'))?.toLowerCase();
    const content = attrs.get('content');
    if (key && content !== undefined && !metas.has(key)) metas.set(key, content);
  }
  return metas;
}

/** La imagen solo se devuelve como URL http(s) absoluta; el servidor no la descarga. */
function safeImage(raw: string | undefined, base: URL): string | null {
  if (!raw || raw.length > 2048) return null;
  try {
    const url = new URL(decode(raw).trim(), base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function parseMetadata(html: string, pageUrl: URL): LinkMetadata {
  // ponytail: regex sobre <meta>/<title>, sin parser HTML; suficiente para og:* y falla cerrado.
  const metas = metaTags(html);
  const title = html.match(/<title[^>]*>([\s\S]{0,1000}?)<\/title>/i)?.[1];
  return {
    titulo: cleanText(metas.get('og:title') ?? metas.get('twitter:title') ?? title, 200),
    descripcion: cleanText(
      metas.get('og:description') ?? metas.get('twitter:description') ?? metas.get('description'),
      300,
    ),
    imagen: safeImage(metas.get('og:image') ?? metas.get('twitter:image'), pageUrl),
    sitio: cleanText(metas.get('og:site_name'), 100) ?? pageUrl.hostname,
  };
}
