import { describe, expect, it } from 'vitest';
import { extraerEnlaces } from '../src/chat/extract-links';

describe('extraerEnlaces', () => {
  it('extrae varios enlaces por mensaje en orden', () => {
    expect(extraerEnlaces('mira https://a.com/x y http://b.org/y ya')).toEqual(['https://a.com/x', 'http://b.org/y']);
  });

  it('quita la puntuacion final', () => {
    expect(extraerEnlaces('ver https://a.com/x. Tambien https://b.com/y, y (https://c.com/z)!')).toEqual([
      'https://a.com/x',
      'https://b.com/y',
      'https://c.com/z',
    ]);
  });

  it('conserva parentesis balanceados dentro de la url', () => {
    expect(extraerEnlaces('https://en.wikipedia.org/wiki/Foo_(bar)')).toEqual(['https://en.wikipedia.org/wiki/Foo_(bar)']);
  });

  it('ignora esquemas que no son http/https', () => {
    expect(extraerEnlaces('javascript:alert(1) ftp://a.com data:text/html,hola mailto:a@b.com')).toEqual([]);
  });

  it('descarta urls invalidas', () => {
    expect(extraerEnlaces('http:// https://')).toEqual([]);
  });

  it('normaliza y deduplica', () => {
    expect(extraerEnlaces('HTTPS://A.com/x https://a.com/x')).toEqual(['https://a.com/x']);
  });

  it('limita enlaces por mensaje', () => {
    const texto = Array.from({ length: 50 }, (_, i) => `https://a.com/${i}`).join(' ');
    expect(extraerEnlaces(texto)).toHaveLength(20);
  });

  it('procesa texto enorme rapido (sin ReDoS)', () => {
    const inicio = Date.now();
    extraerEnlaces('http://' + 'a'.repeat(1_000_000));
    extraerEnlaces('http://a.com/' + '(('.repeat(500_000));
    extraerEnlaces('.'.repeat(1_000_000));
    expect(Date.now() - inicio).toBeLessThan(1000);
  });
});
