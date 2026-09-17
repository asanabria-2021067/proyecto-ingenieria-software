import { describe, expect, it } from 'vitest';
import { formatMotivoRecomendacion, seleccionarRecomendaciones } from '@/lib/social/recomendaciones';
import type { UsuarioBusquedaDto } from '@/lib/types/social';

function candidato(overrides: Partial<UsuarioBusquedaDto> = {}): UsuarioBusquedaDto {
  return {
    idUsuario: 1,
    nombre: 'Ana',
    apellido: 'Pérez',
    fotoUrl: null,
    esAmigo: false,
    solicitudPendiente: null,
    loSigo: false,
    carrera: 'Ingeniería en Ciencias de la Computación',
    semestre: 5,
    mismaCarrera: false,
    amigosEnComun: 0,
    habilidades: [],
    intereses: [],
    ...overrides,
  };
}

describe('formatMotivoRecomendacion', () => {
  it('usa singular con 1 amigo en común', () => {
    expect(formatMotivoRecomendacion({ amigosEnComun: 1, mismaCarrera: false })).toBe('1 amigo en común');
  });

  it('usa plural con más de 1 amigo en común', () => {
    expect(formatMotivoRecomendacion({ amigosEnComun: 3, mismaCarrera: false })).toBe('3 amigos en común');
  });

  it('muestra solo "de tu carrera" cuando no hay amigos en común', () => {
    expect(formatMotivoRecomendacion({ amigosEnComun: 0, mismaCarrera: true })).toBe('de tu carrera');
  });

  it('combina ambos motivos separados por " · "', () => {
    expect(formatMotivoRecomendacion({ amigosEnComun: 2, mismaCarrera: true })).toBe(
      '2 amigos en común · de tu carrera',
    );
  });

  it('devuelve cadena vacía cuando no hay ningún motivo', () => {
    expect(formatMotivoRecomendacion({ amigosEnComun: 0, mismaCarrera: false })).toBe('');
  });
});

describe('seleccionarRecomendaciones', () => {
  it('excluye a quien ya es amigo o tiene solicitud pendiente', () => {
    const resultado = seleccionarRecomendaciones([
      candidato({ idUsuario: 1, esAmigo: true }),
      candidato({ idUsuario: 2, solicitudPendiente: { direccion: 'enviada' } }),
      candidato({ idUsuario: 3 }),
    ]);

    expect(resultado.map((u) => u.idUsuario)).toEqual([3]);
  });

  it('ordena por amigos en común desc y, a igualdad, misma carrera primero', () => {
    const resultado = seleccionarRecomendaciones([
      candidato({ idUsuario: 1, amigosEnComun: 1, mismaCarrera: false }),
      candidato({ idUsuario: 2, amigosEnComun: 3, mismaCarrera: false }),
      candidato({ idUsuario: 3, amigosEnComun: 1, mismaCarrera: true }),
    ]);

    expect(resultado.map((u) => u.idUsuario)).toEqual([2, 3, 1]);
  });

  it('recorta al límite pedido', () => {
    const items = Array.from({ length: 10 }, (_, i) => candidato({ idUsuario: i }));
    expect(seleccionarRecomendaciones(items, 6)).toHaveLength(6);
  });

  it('usa 6 como límite por defecto', () => {
    const items = Array.from({ length: 10 }, (_, i) => candidato({ idUsuario: i }));
    expect(seleccionarRecomendaciones(items)).toHaveLength(6);
  });
});
