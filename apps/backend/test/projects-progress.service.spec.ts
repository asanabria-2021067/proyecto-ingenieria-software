import { describe, expect, it, vi } from 'vitest';
import type { Cache } from 'cache-manager';
import { ProjectsService } from '../src/projects/projects.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { NotificationsService } from '../src/notifications/notifications.service';

/**
 * Tarea 23: las tareas con soft delete (Tarea 22, `eliminadoEn !== null`) no
 * deben participar en el cálculo de avance. La fórmula real vive en
 * `calcularAvanceTareas`/`calcularAvanceHitos` (funciones privadas del
 * módulo, no exportadas): por eso estas pruebas nunca reimplementan la
 * fórmula, solo llaman a los métodos públicos reales `getAvance` y
 * `findMine` y verifican tanto la forma de la consulta Prisma como el
 * resultado observable.
 *
 * `filtrarComoPrisma` simula la evaluación real de un WHERE de Prisma sobre
 * la relación `tareas`: si el `where` recibido no es exactamente
 * `{ eliminadoEn: null }`, se comporta como lo haría Prisma sin ese filtro
 * (devuelve TODAS las filas, incluidas las eliminadas). Esto hace que una
 * regresión real en el código (quitar el `where`) cambie el resultado
 * observado por la prueba, no solo la aserción estructural aislada.
 */
interface TareaFixture {
  estadoTarea: string;
  eliminadoEn: Date | null;
  idHito?: number | null;
}

function filtrarComoPrisma(tareas: TareaFixture[], whereArg: unknown) {
  const esFiltroCorrecto =
    !!whereArg &&
    typeof whereArg === 'object' &&
    (whereArg as Record<string, unknown>).eliminadoEn === null &&
    Object.keys(whereArg as Record<string, unknown>).length === 1;

  const filas = esFiltroCorrecto ? tareas.filter((t) => t.eliminadoEn === null) : tareas;
  return filas.map((t) => ({ estadoTarea: t.estadoTarea, idHito: t.idHito ?? null }));
}

interface FindArgs {
  select: { tareas: { where: unknown }; hitos: unknown };
}

function makePrismaGetAvance(
  tareasFixture: TareaFixture[],
  hitosFixture: { idHito: number }[] = [],
  creadoPor = 1,
) {
  const findFirst = vi.fn(async (args: FindArgs) => ({
    creadoPor,
    tareas: filtrarComoPrisma(tareasFixture, args?.select?.tareas?.where),
    hitos: hitosFixture,
  }));
  return {
    proyecto: { findFirst },
    participacionProyecto: { findFirst: vi.fn().mockResolvedValue(null) },
  };
}

function makePrismaFindMine(tareasFixture: TareaFixture[], hitosFixture: { idHito: number }[] = []) {
  const findMany = vi.fn(async (args: FindArgs) => [
    {
      roles: [],
      tareas: filtrarComoPrisma(tareasFixture, args?.select?.tareas?.where),
      hitos: hitosFixture,
    },
  ]);
  return { proyecto: { findMany } };
}

function makeService(prisma: unknown) {
  return new ProjectsService(
    prisma as unknown as PrismaService,
    {} as unknown as NotificationsService,
    {} as unknown as Cache,
  );
}

const LIDER_ID = 1;

describe('ProjectsService — avance excluye tareas con soft delete (Tarea 23)', () => {
  describe('getAvance: forma exacta de la consulta Prisma', () => {
    it('la relación tareas se consulta con where: { eliminadoEn: null }', async () => {
      const prisma = makePrismaGetAvance([]);
      const service = makeService(prisma);

      await service.getAvance(1, LIDER_ID);

      const select = prisma.proyecto.findFirst.mock.calls[0][0].select;
      expect(select.tareas).toEqual({
        where: { eliminadoEn: null },
        select: { estadoTarea: true, idHito: true },
      });
    });

    it('no ejecuta ninguna consulta adicional (una sola llamada a findFirst)', async () => {
      const prisma = makePrismaGetAvance([]);
      const service = makeService(prisma);

      await service.getAvance(1, LIDER_ID);

      expect(prisma.proyecto.findFirst).toHaveBeenCalledTimes(1);
    });
  });

  describe('findMine: forma exacta de la consulta Prisma', () => {
    it('la relación tareas se consulta con where: { eliminadoEn: null }', async () => {
      const prisma = makePrismaFindMine([]);
      const service = makeService(prisma);

      await service.findMine(LIDER_ID);

      const select = prisma.proyecto.findMany.mock.calls[0][0].select;
      expect(select.tareas).toEqual({
        where: { eliminadoEn: null },
        select: { estadoTarea: true, idHito: true },
      });
    });

    it('no ejecuta ninguna consulta adicional (una sola llamada a findMany)', async () => {
      const prisma = makePrismaFindMine([]);
      const service = makeService(prisma);

      await service.findMine(LIDER_ID);

      expect(prisma.proyecto.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('proyecto sin tareas', () => {
    it('getAvance: 0 tareas → porcentaje 0 (comportamiento previo conservado)', async () => {
      const prisma = makePrismaGetAvance([]);
      const service = makeService(prisma);

      const result = await service.getAvance(1, LIDER_ID);

      expect(result.tareas).toEqual({ porcentaje: 0, total: 0, porHacer: 0, enProgreso: 0, hecho: 0 });
    });
  });

  describe('tareas activas sin eliminadas', () => {
    it('getAvance calcula igual que antes de esta tarea (2 activas, 1 hecha → 50%)', async () => {
      const prisma = makePrismaGetAvance([
        { estadoTarea: 'HECHO', eliminadoEn: null },
        { estadoTarea: 'POR_HACER', eliminadoEn: null },
      ]);
      const service = makeService(prisma);

      const result = await service.getAvance(1, LIDER_ID);

      expect(result.tareas.porcentaje).toBe(50);
      expect(result.tareas.total).toBe(2);
    });
  });

  describe('tarea completada eliminada', () => {
    it('una tarea eliminada HECHO no aumenta numerador ni denominador', async () => {
      const prisma = makePrismaGetAvance([
        { estadoTarea: 'POR_HACER', eliminadoEn: null },
        { estadoTarea: 'HECHO', eliminadoEn: new Date('2026-01-01') }, // eliminada
      ]);
      const service = makeService(prisma);

      const result = await service.getAvance(1, LIDER_ID);

      // Correcto: solo cuenta la activa POR_HACER → 0/1 = 0%.
      // Si la eliminada "hecha" se filtrara mal, el resultado subiría a 50%.
      expect(result.tareas).toMatchObject({ total: 1, hecho: 0, porcentaje: 0 });
    });
  });

  describe('tarea no completada eliminada', () => {
    it('una tarea eliminada POR_HACER no aumenta el denominador ni reduce el porcentaje', async () => {
      const prisma = makePrismaGetAvance([
        { estadoTarea: 'HECHO', eliminadoEn: null },
        { estadoTarea: 'POR_HACER', eliminadoEn: new Date('2026-01-01') }, // eliminada
      ]);
      const service = makeService(prisma);

      const result = await service.getAvance(1, LIDER_ID);

      // Correcto: solo cuenta la activa HECHO → 1/1 = 100%.
      // Si la eliminada "por hacer" se filtrara mal, el resultado bajaría a 50%.
      expect(result.tareas).toMatchObject({ total: 1, hecho: 1, porcentaje: 100 });
    });
  });

  describe('mezcla de tareas activas y eliminadas', () => {
    it('el resultado se calcula únicamente con las tareas activas', async () => {
      const prisma = makePrismaGetAvance([
        { estadoTarea: 'HECHO', eliminadoEn: null },
        { estadoTarea: 'HECHO', eliminadoEn: null },
        { estadoTarea: 'POR_HACER', eliminadoEn: null },
        { estadoTarea: 'HECHO', eliminadoEn: new Date('2026-01-01') }, // eliminada, no debe contarse
        { estadoTarea: 'POR_HACER', eliminadoEn: new Date('2026-01-01') }, // eliminada, no debe contarse
      ]);
      const service = makeService(prisma);

      const result = await service.getAvance(1, LIDER_ID);

      // Correcto (solo las 3 activas): 2 hechas / 3 total = 67%.
      // Si el filtro fallara (las 5 contaran): 3 hechas / 5 total = 60% — distinto, detectable.
      expect(result.tareas).toMatchObject({ total: 3, hecho: 2, porcentaje: 67 });
    });
  });

  describe('todas las tareas eliminadas', () => {
    it('equivale exactamente a un proyecto sin tareas activas (0%)', async () => {
      const prisma = makePrismaGetAvance([
        { estadoTarea: 'HECHO', eliminadoEn: new Date('2026-01-01') },
        { estadoTarea: 'POR_HACER', eliminadoEn: new Date('2026-01-01') },
      ]);
      const service = makeService(prisma);

      const result = await service.getAvance(1, LIDER_ID);

      expect(result.tareas).toEqual({ porcentaje: 0, total: 0, porHacer: 0, enProgreso: 0, hecho: 0 });
    });
  });

  describe('una tarea activa que luego pasa a eliminada', () => {
    it('el segundo cálculo deja de considerarla inmediatamente, sin caché ni estado obsoleto', async () => {
      const tareasCompartidas: TareaFixture[] = [{ estadoTarea: 'HECHO', eliminadoEn: null }];
      const prisma = makePrismaGetAvance(tareasCompartidas);
      const service = makeService(prisma);

      const antes = await service.getAvance(1, LIDER_ID);
      expect(antes.tareas).toMatchObject({ total: 1, hecho: 1, porcentaje: 100 });

      // Se marca eliminada la misma tarea (mutación directa del fixture que el
      // mock de Prisma lee en cada llamada — no hay caché de por medio).
      tareasCompartidas[0].eliminadoEn = new Date('2026-02-01');

      const despues = await service.getAvance(1, LIDER_ID);
      expect(despues.tareas).toEqual({ porcentaje: 0, total: 0, porHacer: 0, enProgreso: 0, hecho: 0 });
    });
  });

  describe('fórmula y redondeo sin cambios', () => {
    it('conserva Math.round: 1/3 → 33% (no 33.33, no trunca hacia abajo distinto)', async () => {
      const prisma = makePrismaGetAvance([
        { estadoTarea: 'HECHO', eliminadoEn: null },
        { estadoTarea: 'POR_HACER', eliminadoEn: null },
        { estadoTarea: 'EN_PROGRESO', eliminadoEn: null },
        { estadoTarea: 'HECHO', eliminadoEn: new Date('2026-01-01') }, // eliminada: no debe alterar el redondeo
      ]);
      const service = makeService(prisma);

      const result = await service.getAvance(1, LIDER_ID);

      expect(result.tareas.porcentaje).toBe(33);
    });
  });

  describe('contrato público sin cambios', () => {
    it('getAvance conserva exactamente las mismas claves que antes de esta tarea', async () => {
      const prisma = makePrismaGetAvance(
        [{ estadoTarea: 'HECHO', eliminadoEn: null, idHito: 1 }],
        [{ idHito: 1 }],
      );
      const service = makeService(prisma);

      const result = await service.getAvance(1, LIDER_ID);

      expect(Object.keys(result).sort()).toEqual(['hitos', 'tareas'].sort());
      expect(Object.keys(result.tareas).sort()).toEqual(
        ['porcentaje', 'total', 'porHacer', 'enProgreso', 'hecho'].sort(),
      );
      expect(Object.keys(result.hitos).sort()).toEqual(
        ['porcentaje', 'total', 'pendiente', 'enProgreso', 'completado'].sort(),
      );
    });

    it('findMine sigue exponiendo avanceProyecto con la misma forma', async () => {
      const prisma = makePrismaFindMine([{ estadoTarea: 'HECHO', eliminadoEn: null }]);
      const service = makeService(prisma);

      const [result] = await service.findMine(LIDER_ID);

      expect(Object.keys(result.avanceProyecto).sort()).toEqual(['hitos', 'tareas'].sort());
      expect(result.avanceProyecto.tareas.porcentaje).toBe(100);
    });
  });

  describe('más de un consumidor: getAvance y findMine excluyen igual', () => {
    it('ambos métodos excluyen las tareas eliminadas de forma consistente con el mismo dataset', async () => {
      const dataset: TareaFixture[] = [
        { estadoTarea: 'HECHO', eliminadoEn: null },
        { estadoTarea: 'HECHO', eliminadoEn: new Date('2026-01-01') },
      ];

      const resultGetAvance = await makeService(makePrismaGetAvance(dataset)).getAvance(1, LIDER_ID);
      const [resultFindMine] = await makeService(makePrismaFindMine(dataset)).findMine(LIDER_ID);

      expect(resultGetAvance.tareas).toMatchObject({ total: 1, hecho: 1, porcentaje: 100 });
      expect(resultFindMine.avanceProyecto.tareas).toMatchObject({ total: 1, hecho: 1, porcentaje: 100 });
    });
  });

  /**
   * Bug de producción (HU-128): `estadoHito` se fija en PENDIENTE al crear el
   * hito (createHito) y ningún flujo del backend lo vuelve a escribir, así
   * que la barra "Progreso de hitos" quedaba congelada en 0% aunque todas las
   * tareas de un hito estuvieran HECHO. El fix deriva el estado de cada hito
   * de sus tareas reales (`tarea.idHito`), igual que ya hacía el frontend en
   * `calcularStats` (hitos-section.tsx) para las tarjetas por hito.
   */
  describe('cálculo de hitos deriva de tareas reales, no del campo estadoHito (bug HU-128)', () => {
    it('hito con todas sus tareas HECHO cuenta como completado, aunque estadoHito nunca se actualice', async () => {
      const prisma = makePrismaGetAvance(
        [
          { estadoTarea: 'HECHO', eliminadoEn: null, idHito: 1 },
          { estadoTarea: 'HECHO', eliminadoEn: null, idHito: 1 },
        ],
        [{ idHito: 1 }],
      );
      const service = makeService(prisma);

      const result = await service.getAvance(1, LIDER_ID);

      expect(result.hitos).toEqual({ porcentaje: 100, total: 1, pendiente: 0, enProgreso: 0, completado: 1 });
    });

    it('hito con algunas tareas HECHO (no todas) cuenta como en progreso', async () => {
      const prisma = makePrismaGetAvance(
        [
          { estadoTarea: 'HECHO', eliminadoEn: null, idHito: 1 },
          { estadoTarea: 'POR_HACER', eliminadoEn: null, idHito: 1 },
        ],
        [{ idHito: 1 }],
      );
      const service = makeService(prisma);

      const result = await service.getAvance(1, LIDER_ID);

      expect(result.hitos).toEqual({ porcentaje: 0, total: 1, pendiente: 0, enProgreso: 1, completado: 0 });
    });

    it('hito sin ninguna tarea completada cuenta como pendiente', async () => {
      const prisma = makePrismaGetAvance(
        [{ estadoTarea: 'POR_HACER', eliminadoEn: null, idHito: 1 }],
        [{ idHito: 1 }],
      );
      const service = makeService(prisma);

      const result = await service.getAvance(1, LIDER_ID);

      expect(result.hitos).toEqual({ porcentaje: 0, total: 1, pendiente: 1, enProgreso: 0, completado: 0 });
    });

    it('hito sin tareas asociadas cuenta como pendiente (no completado por vacío)', async () => {
      const prisma = makePrismaGetAvance([], [{ idHito: 1 }]);
      const service = makeService(prisma);

      const result = await service.getAvance(1, LIDER_ID);

      expect(result.hitos).toEqual({ porcentaje: 0, total: 1, pendiente: 1, enProgreso: 0, completado: 0 });
    });

    it('una tarea eliminada (soft delete) no cuenta para completar su hito', async () => {
      const prisma = makePrismaGetAvance(
        [{ estadoTarea: 'HECHO', eliminadoEn: new Date('2026-01-01'), idHito: 1 }],
        [{ idHito: 1 }],
      );
      const service = makeService(prisma);

      const result = await service.getAvance(1, LIDER_ID);

      // La tarea eliminada se filtra antes de llegar a calcularAvanceHitos:
      // el hito queda sin tareas activas → pendiente, no completado.
      expect(result.hitos).toEqual({ porcentaje: 0, total: 1, pendiente: 1, enProgreso: 0, completado: 0 });
    });

    it('porcentaje global de hitos = hitos 100% completos / total de hitos (no promedio de %s)', async () => {
      const prisma = makePrismaGetAvance(
        [
          { estadoTarea: 'HECHO', eliminadoEn: null, idHito: 1 },
          { estadoTarea: 'HECHO', eliminadoEn: null, idHito: 2 },
          { estadoTarea: 'POR_HACER', eliminadoEn: null, idHito: 2 },
          { estadoTarea: 'POR_HACER', eliminadoEn: null, idHito: 3 },
        ],
        [{ idHito: 1 }, { idHito: 2 }, { idHito: 3 }],
      );
      const service = makeService(prisma);

      const result = await service.getAvance(1, LIDER_ID);

      // Hito 1 completado, hito 2 en progreso, hito 3 pendiente → 1/3 = 33%.
      expect(result.hitos).toEqual({ porcentaje: 33, total: 3, pendiente: 1, enProgreso: 1, completado: 1 });
    });

    it('findMine deriva el avance de hitos con el mismo criterio que getAvance', async () => {
      const prisma = makePrismaFindMine(
        [
          { estadoTarea: 'HECHO', eliminadoEn: null, idHito: 5 },
          { estadoTarea: 'HECHO', eliminadoEn: null, idHito: 5 },
        ],
        [{ idHito: 5 }],
      );
      const service = makeService(prisma);

      const [result] = await service.findMine(LIDER_ID);

      expect(result.avanceProyecto.hitos).toEqual({
        porcentaje: 100,
        total: 1,
        pendiente: 0,
        enProgreso: 0,
        completado: 1,
      });
    });

    it('la consulta de hitos ya no selecciona estadoHito (columna congelada, ignorada por el cálculo)', async () => {
      const prisma = makePrismaGetAvance([], []);
      const service = makeService(prisma);

      await service.getAvance(1, LIDER_ID);

      const select = prisma.proyecto.findFirst.mock.calls[0][0].select;
      expect(select.hitos).toEqual({ select: { idHito: true } });
    });
  });
});
