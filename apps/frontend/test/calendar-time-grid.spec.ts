import { describe, expect, it } from 'vitest';
import { HORA_ALTO_PX, layoutDia, posicionAhora, tonoDeEvento, type EventoItem } from '@/lib/calendar/time-grid';

function evento(id: number, inicio: [number, number], fin: [number, number], overrides: Partial<EventoItem> = {}): EventoItem {
  const fechaInicio = new Date(2026, 9, 6, inicio[0], inicio[1]);
  const fechaFin = new Date(2026, 9, 6, fin[0], fin[1]);
  return {
    kind: 'evento',
    key: '2026-10-06',
    sortKey: '',
    id,
    projectId: 1,
    titulo: `E${id}`,
    descripcion: null,
    modalidad: 'VIRTUAL',
    tipo: 'REUNION',
    multiDia: false,
    projectTitle: 'P',
    href: '',
    horaInicio: '',
    horaFin: '',
    fechaInicio,
    fechaFin,
    ...overrides,
  };
}

describe('calendar/time-grid layoutDia (HU-184 T-324)', () => {
  it('posiciona por hora: 9:00–10:30 empieza en 9h y mide 1.5h', () => {
    const [bloque] = layoutDia([evento(1, [9, 0], [10, 30])]);
    expect(bloque.top).toBe(9 * HORA_ALTO_PX);
    expect(bloque.height).toBe(1.5 * HORA_ALTO_PX);
    expect(bloque.columnas).toBe(1);
  });

  it('dos eventos que se solapan se reparten en dos columnas', () => {
    const bloques = layoutDia([evento(1, [9, 0], [10, 0]), evento(2, [9, 30], [11, 0])]);
    expect(bloques.map((b) => [b.item.id, b.columna, b.columnas])).toEqual([
      [1, 0, 2],
      [2, 1, 2],
    ]);
  });

  it('eventos seguidos (uno termina cuando empieza el otro) no se solapan', () => {
    const bloques = layoutDia([evento(1, [9, 0], [10, 0]), evento(2, [10, 0], [11, 0])]);
    expect(bloques.every((b) => b.columnas === 1 && b.columna === 0)).toBe(true);
  });

  it('reutiliza la columna que se libera dentro del mismo grupo', () => {
    const bloques = layoutDia([evento(1, [9, 0], [12, 0]), evento(2, [9, 0], [10, 0]), evento(3, [10, 0], [11, 0])]);
    const porId = Object.fromEntries(bloques.map((b) => [b.item.id, b]));
    expect(porId[1].columna).toBe(0);
    expect(porId[2].columna).toBe(1);
    expect(porId[3].columna).toBe(1);
    expect(porId[1].columnas).toBe(2);
  });

  it('numera los grupos de solapamiento', () => {
    const bloques = layoutDia([evento(1, [9, 0], [10, 0]), evento(2, [9, 30], [10, 30]), evento(3, [12, 0], [13, 0])]);
    const porId = Object.fromEntries(bloques.map((b) => [b.item.id, b.grupo]));
    expect(porId[1]).toBe(porId[2]);
    expect(porId[3]).not.toBe(porId[1]);
  });

  it('un evento muy corto se dibuja con un mínimo legible', () => {
    const [bloque] = layoutDia([evento(1, [9, 0], [9, 10])]);
    expect(bloque.height).toBe(0.5 * HORA_ALTO_PX);
  });

  it('los eventos de varios días no van en la cuadrícula de horas', () => {
    expect(layoutDia([evento(1, [9, 0], [10, 0], { multiDia: true })])).toEqual([]);
  });

  it('tonoDeEvento usa el tono del tipo, o el de la persona si es compartido', () => {
    expect(tonoDeEvento(evento(1, [9, 0], [10, 0], { tipo: 'TUTORIA' }))).toBe(1);
    expect(
      tonoDeEvento(evento(1, [9, 0], [10, 0], { tipo: 'TUTORIA', compartidoPor: { idUsuario: 2, nombre: 'Ana', tono: 5 } })),
    ).toBe(5);
  });

  it('posicionAhora ubica la línea de la hora actual', () => {
    expect(posicionAhora(new Date(2026, 9, 6, 13, 30))).toBe(13.5 * HORA_ALTO_PX);
  });
});
