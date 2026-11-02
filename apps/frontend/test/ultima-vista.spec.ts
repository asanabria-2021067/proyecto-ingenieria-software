import { describe, expect, it } from 'vitest';
import { parsearUltimaVista } from '../lib/ultima-vista';

const vista = { idUsuario: 7, href: '/dashboard/mis-horas', etiqueta: 'Mis horas' };

describe('parsearUltimaVista (MEJ-78)', () => {
  it('devuelve la vista guardada del mismo usuario', () => {
    expect(parsearUltimaVista(JSON.stringify(vista), 7)).toEqual(vista);
  });

  it('descarta la de otro usuario, sin sesion, vacia o corrupta', () => {
    expect(parsearUltimaVista(JSON.stringify(vista), 8)).toBeNull();
    expect(parsearUltimaVista(JSON.stringify(vista), undefined)).toBeNull();
    expect(parsearUltimaVista(null, 7)).toBeNull();
    expect(parsearUltimaVista('{no es json', 7)).toBeNull();
  });

  it('descarta destinos que no son rutas internas', () => {
    for (const href of ['https://otro.sitio/dashboard/x', '//evil.com', '/dashboard', '/login']) {
      expect(parsearUltimaVista(JSON.stringify({ ...vista, href }), 7)).toBeNull();
    }
  });
});
