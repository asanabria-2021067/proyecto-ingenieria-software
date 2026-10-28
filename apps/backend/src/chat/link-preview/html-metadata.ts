export interface LinkMetadata {
  titulo: string | null;
  descripcion: string | null;
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
  const text = decode(raw.slice(0, max * 4))
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

// Se analiza solo el inicio del HTML y se descartan etiquetas enormes: acota el costo por entrada.
const MAX_HTML = 64 * 1024;
const MAX_TAG = 4096;

function metaTags(html: string): Map<string, string> {
  const metas = new Map<string, string>();
  const re = /<meta\b/gi;
  let found: RegExpExecArray | null;
  while ((found = re.exec(html))) {
    const end = html.indexOf('>', found.index);
    if (end < 0) break;
    re.lastIndex = end + 1;
    if (end - found.index > MAX_TAG) continue;
    const tag = html.slice(found.index, end + 1);
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

function tituloHtml(html: string): string | undefined {
  const open = html.search(/<title\b/i);
  if (open < 0) return undefined;
  const gt = html.indexOf('>', open);
  if (gt < 0) return undefined;
  const start = gt + 1;
  const close = html.slice(start, start + 1009).search(/<\/title>/i);
  return close < 0 || close > 1000 ? undefined : html.slice(start, start + close);
}

export function parseMetadata(html: string, pageUrl: URL): LinkMetadata {
  // ponytail: regex sobre <meta>/<title>, sin parser HTML; suficiente para og:* y falla cerrado.
  const doc = html.slice(0, MAX_HTML);
  const metas = metaTags(doc);
  const title = tituloHtml(doc);
  return {
    titulo: cleanText(metas.get('og:title') ?? metas.get('twitter:title') ?? title, 200),
    descripcion: cleanText(
      metas.get('og:description') ?? metas.get('twitter:description') ?? metas.get('description'),
      300,
    ),
    sitio: cleanText(metas.get('og:site_name'), 100) ?? pageUrl.hostname,
  };
}
