import { describe, expect, it } from 'vitest';
import { cleanText, parseMetadata } from '../src/chat/link-preview/html-metadata';

const page = new URL('https://example.com/blog/post');

describe('parseMetadata', () => {
  it('lee og:title, og:description, og:image y og:site_name', () => {
    const html = `<html><head><title>Fallback</title>
      <meta property="og:title" content="Titulo OG">
      <meta property="og:description" content="Descripcion OG">
      <meta property="og:image" content="https://cdn.example.com/i.png">
      <meta property="og:site_name" content="Mi Sitio"></head></html>`;
    expect(parseMetadata(html, page)).toEqual({
      titulo: 'Titulo OG',
      descripcion: 'Descripcion OG',
      imagen: 'https://cdn.example.com/i.png',
      sitio: 'Mi Sitio',
    });
  });

  it('usa <title>, meta description y hostname como respaldo', () => {
    const html = '<title>  Hola\n  mundo </title><meta name="description" content="desc">';
    expect(parseMetadata(html, page)).toEqual({ titulo: 'Hola mundo', descripcion: 'desc', imagen: null, sitio: 'example.com' });
  });

  it('usa twitter:* cuando no hay og:*', () => {
    const html = '<meta name="twitter:title" content="T"><meta name="twitter:description" content="D"><meta name="twitter:image" content="/x.png">';
    const r = parseMetadata(html, page);
    expect(r.titulo).toBe('T');
    expect(r.descripcion).toBe('D');
    expect(r.imagen).toBe('https://example.com/x.png');
  });

  it('acepta comillas simples, sin comillas y orden de atributos invertido', () => {
    const html = "<meta content='A' property='og:title'><meta content=B property=og:description>";
    const r = parseMetadata(html, page);
    expect(r.titulo).toBe('A');
    expect(r.descripcion).toBe('B');
  });

  it('el primer meta repetido gana', () => {
    const html = '<meta property="og:title" content="Primero"><meta property="og:title" content="Segundo">';
    expect(parseMetadata(html, page).titulo).toBe('Primero');
  });

  it('sin metadatos devuelve nulos y hostname', () => {
    expect(parseMetadata('<p>nada</p>', page)).toEqual({ titulo: null, descripcion: null, imagen: null, sitio: 'example.com' });
  });

  it('descarta imagenes que no son http(s), con credenciales, demasiado largas o invalidas', () => {
    for (const img of ['javascript:alert(1)', 'data:image/png;base64,AAAA', 'file:///etc/passwd', 'ftp://x/y.png', 'https://u:p@x.com/i.png', 'http://']) {
      expect(parseMetadata(`<meta property="og:image" content="${img}">`, page).imagen).toBeNull();
    }
    const largo = `https://x.com/${'a'.repeat(2100)}`;
    expect(parseMetadata(`<meta property="og:image" content="${largo}">`, page).imagen).toBeNull();
  });

  it('resuelve imagen relativa y decodifica &amp; en la URL', () => {
    const r = parseMetadata('<meta property="og:image" content="/i.png?a=1&amp;b=2">', page);
    expect(r.imagen).toBe('https://example.com/i.png?a=1&b=2');
  });

  it('sanitiza: entidades, etiquetas, controles y recorte', () => {
    const html = `<meta property="og:title" content="&lt;b&gt;Hola&lt;/b&gt; &amp; &#39;adios&#39; &#x41;\u0007x">
      <meta property="og:description" content="${'d'.repeat(500)}">`;
    const r = parseMetadata(html, page);
    expect(r.titulo).toBe("Hola & 'adios' A x");
    expect(r.descripcion).toHaveLength(300);
    expect(r.descripcion!.endsWith('...')).toBe(true);
  });

  it('un <script> en el titulo se devuelve como texto sin etiquetas', () => {
    const r = parseMetadata('<title><script>alert(1)</script>Hola</title>', page);
    expect(r.titulo).not.toContain('<');
    expect(r.titulo).toContain('Hola');
  });
});

describe('cleanText', () => {
  it('devuelve null para vacio o solo espacios', () => {
    expect(cleanText(undefined, 10)).toBeNull();
    expect(cleanText('', 10)).toBeNull();
    expect(cleanText('   \n ', 10)).toBeNull();
  });

  it('deja entidades desconocidas y numericas invalidas tal cual', () => {
    expect(cleanText('&foo; &#99999999;', 50)).toBe('&foo; &#99999999;');
  });

  it('no recorta texto dentro del maximo', () => {
    expect(cleanText('abc', 3)).toBe('abc');
  });
});
