import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { EstadoTarea, RepeticionTarea } from '@prisma/client';
import {
  assertBloqueanteValido,
  assertNoBloqueada,
  sumarRepeticion,
} from '../src/tasks/tasks-writes.helpers';
import { hoyGuatemala } from '../src/tasks/tasks-recurrence.service';

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

describe('MEJ-47: sumarRepeticion', () => {
  it('diaria suma un dia y semanal siete', () => {
    expect(iso(sumarRepeticion(dia('2026-12-31'), RepeticionTarea.DIARIA))).toBe('2027-01-01');
    expect(iso(sumarRepeticion(dia('2026-11-25'), RepeticionTarea.SEMANAL))).toBe('2026-12-02');
  });

  it('mensual conserva el dia y se ajusta al ultimo dia del mes corto', () => {
    expect(iso(sumarRepeticion(dia('2026-11-15'), RepeticionTarea.MENSUAL))).toBe('2026-12-15');
    expect(iso(sumarRepeticion(dia('2026-01-31'), RepeticionTarea.MENSUAL))).toBe('2026-02-28');
    expect(iso(sumarRepeticion(dia('2028-01-31'), RepeticionTarea.MENSUAL))).toBe('2028-02-29');
    expect(iso(sumarRepeticion(dia('2026-12-31'), RepeticionTarea.MENSUAL))).toBe('2027-01-31');
  });

  it('mensual anclada al dia original no degrada 31 a 28 para siempre', () => {
    let fecha = dia('2026-01-31');
    const vistas: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      fecha = sumarRepeticion(fecha, RepeticionTarea.MENSUAL, 31);
      vistas.push(iso(fecha));
    }
    expect(vistas).toEqual(['2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('hoyGuatemala usa el dia calendario UTC-6', () => {
    expect(iso(hoyGuatemala(new Date('2026-11-12T05:30:00.000Z')))).toBe('2026-11-11');
    expect(iso(hoyGuatemala(new Date('2026-11-12T06:00:00.000Z')))).toBe('2026-11-12');
  });
});

/** Fake de tx.tarea.findFirst sobre un mapa idTarea -> fila. */
function txConTareas(filas: Record<number, { idProyecto: number; idTareaBloqueante: number | null; eliminadoEn?: Date | null; estadoTarea?: EstadoTarea; tituloTarea?: string }>) {
  return {
    tarea: {
      findFirst: vi.fn(async ({ where }: { where: { idTarea: number; estadoTarea?: unknown } }) => {
        const fila = filas[where.idTarea];
        if (!fila) return null;
        if (where.estadoTarea && fila.estadoTarea === EstadoTarea.HECHO) return null;
        return { ...fila, tituloTarea: fila.tituloTarea ?? `T${where.idTarea}` };
      }),
    },
  } as never;
}

describe('MEJ-48: assertBloqueanteValido', () => {
  const filas = {
    1: { idProyecto: 7, idTareaBloqueante: null },
    2: { idProyecto: 7, idTareaBloqueante: 1 },
    3: { idProyecto: 7, idTareaBloqueante: 2 },
    9: { idProyecto: 8, idTareaBloqueante: null },
  };

  it('acepta una tarea del mismo proyecto sin ciclo', async () => {
    await expect(assertBloqueanteValido(txConTareas(filas), 7, 4, 3)).resolves.toBeUndefined();
    await expect(assertBloqueanteValido(txConTareas(filas), 7, null, 3)).resolves.toBeUndefined();
  });

  it('un eslabon posterior eliminado corta el recorrido y no invalida al bloqueante', async () => {
    const conEliminada = {
      ...filas,
      5: { idProyecto: 7, idTareaBloqueante: 6 },
      6: { idProyecto: 7, idTareaBloqueante: null, eliminadoEn: new Date() },
    };
    await expect(assertBloqueanteValido(txConTareas(conEliminada), 7, 4, 5)).resolves.toBeUndefined();
    await expect(assertBloqueanteValido(txConTareas(conEliminada), 7, 4, 6)).rejects.toThrow(/no existe en este proyecto/);
  });

  it('rechaza bloquearse a si misma', async () => {
    await expect(assertBloqueanteValido(txConTareas(filas), 7, 2, 2)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza un ciclo directo e indirecto', async () => {
    // 1 bloqueada por 3: 3 -> 2 -> 1 -> 3
    await expect(assertBloqueanteValido(txConTareas(filas), 7, 1, 3)).rejects.toThrow(/ciclo/);
    await expect(assertBloqueanteValido(txConTareas(filas), 7, 1, 2)).rejects.toThrow(/ciclo/);
  });

  it('rechaza una tarea de otro proyecto o inexistente', async () => {
    await expect(assertBloqueanteValido(txConTareas(filas), 7, 4, 9)).rejects.toThrow(/no existe en este proyecto/);
    await expect(assertBloqueanteValido(txConTareas(filas), 7, 4, 404)).rejects.toThrow(/no existe en este proyecto/);
  });
});

describe('MEJ-48: assertNoBloqueada', () => {
  const filas = {
    1: { idProyecto: 7, idTareaBloqueante: null, estadoTarea: EstadoTarea.EN_PROGRESO, tituloTarea: 'Base' },
    2: { idProyecto: 7, idTareaBloqueante: null, estadoTarea: EstadoTarea.HECHO, tituloTarea: 'Lista' },
  };

  it('no consulta nada sin bloqueante ni para POR_HACER', async () => {
    const tx = txConTareas(filas);
    await assertNoBloqueada(tx, [{ idTareaBloqueante: null }], EstadoTarea.EN_PROGRESO);
    await assertNoBloqueada(tx, [{ idTareaBloqueante: 1 }], EstadoTarea.POR_HACER);
    expect((tx as unknown as { tarea: { findFirst: ReturnType<typeof vi.fn> } }).tarea.findFirst).not.toHaveBeenCalled();
  });

  it('bloquea el paso a En progreso, En revision y Hecho mientras el bloqueante no este Hecho', async () => {
    for (const estado of [EstadoTarea.EN_PROGRESO, EstadoTarea.EN_REVISION, EstadoTarea.HECHO]) {
      await expect(
        assertNoBloqueada(txConTareas(filas), [{ tituloTarea: 'Mia', idTareaBloqueante: 1 }], estado),
      ).rejects.toBeInstanceOf(ConflictException);
    }
  });

  it('permite avanzar cuando el bloqueante ya esta Hecho o fue eliminado', async () => {
    await expect(
      assertNoBloqueada(txConTareas(filas), [{ idTareaBloqueante: 2 }], EstadoTarea.EN_PROGRESO),
    ).resolves.toBeUndefined();
    await expect(
      assertNoBloqueada(txConTareas(filas), [{ idTareaBloqueante: 404 }], EstadoTarea.EN_PROGRESO),
    ).resolves.toBeUndefined();
  });
});
