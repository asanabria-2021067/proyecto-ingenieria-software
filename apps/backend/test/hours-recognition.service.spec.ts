import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { HoursRecognitionService } from '../src/sprints/hours-recognition.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Firma real y completa de los argumentos de `aggregate` (para tipar el
 * parámetro del mock tal como lo recibiría en producción) y tipo exacto que
 * Prisma genera para `aggregate({ _sum: { horasReales: true } })` (para
 * tipar el resultado devuelto) — ambos extraídos directamente del Prisma
 * Client generado, nunca `any`/`unknown`.
 */
type HorasRealesAggregateArgs = Prisma.AsignacionTareaAggregateArgs;
type HorasRealesAggregateResult = Prisma.GetAsignacionTareaAggregateType<{
  _sum: { horasReales: true };
}>;

/**
 * `PrismaService.asignacionTarea.aggregate` es un método genérico
 * sobrecargado (el tipo de retorno depende del `_sum`/`_avg`/`_min`/`_max`
 * exactos recibidos en cada llamada): ningún `vi.fn()` con una firma
 * concreta es directamente asignable a esa propiedad sin perder la
 * genericidad, y forzarlo exigiría exactamente el patrón `as unknown as X`
 * que no se debe usar aquí. En su lugar se crea un `vi.fn()` con la firma
 * REAL y concreta que usa la implementación de producción
 * (`HorasRealesAggregateArgs -> Promise<HorasRealesAggregateResult>`,
 * ambos tipos extraídos del propio Prisma Client generado, no `any`/
 * `unknown`), y se instala con `Reflect.set` — el mismo mecanismo ya usado
 * en A4.1 para asignar un campo cuyo tipo declarado no coincide con el
 * valor de prueba, sin recurrir a ninguna aserción de tipo.
 */
function makePrisma(horasReales: number | null = 0) {
  const prisma = new PrismaService();
  const aggregate = vi.fn(async (_args: HorasRealesAggregateArgs): Promise<HorasRealesAggregateResult> => ({
    _sum: {
      horasReales: horasReales === null ? null : new Prisma.Decimal(horasReales),
    },
  }));
  Reflect.set(prisma.asignacionTarea, 'aggregate', aggregate);
  return { prisma, aggregate };
}

const PROJECT_ID = 1;
const SPRINT_ID = 10;
const PARTICIPATION_ID = 100;

describe('HoursRecognitionService', () => {
  describe('calculateRecognizableHours', () => {
    it('caso 1: devuelve directamente el total como number (no Decimal, no _sum)', async () => {
      const { prisma } = makePrisma(5);
      const service = new HoursRecognitionService(prisma);

      const resultado = await service.calculateRecognizableHours({
        projectId: PROJECT_ID,
        sprintId: SPRINT_ID,
        participationId: PARTICIPATION_ID,
      });

      expect(resultado).toBe(5);
      expect(typeof resultado).toBe('number');
    });

    it('caso 2: multi-tramo — el total agregado (3 + 2) se devuelve íntegro, no un único tramo', async () => {
      // La suma la resuelve el aggregate de Prisma/PostgreSQL, no la
      // aplicación: se simula directamente el resultado agregado (5) que
      // representaría 3 + 2 sobre dos tramos elegibles de la misma
      // participación, y se confirma que el servicio no lo recalcula ni lo
      // reduce a un único tramo en memoria.
      const { prisma, aggregate } = makePrisma(5);
      const service = new HoursRecognitionService(prisma);

      const resultado = await service.calculateRecognizableHours({
        projectId: PROJECT_ID,
        sprintId: SPRINT_ID,
        participationId: PARTICIPATION_ID,
      });

      expect(resultado).toBe(5);
      expect(aggregate).toHaveBeenCalledTimes(1);
    });

    it('caso 3: multirol — filtra exactamente por idParticipacion, nunca por idUsuario', async () => {
      const { prisma, aggregate } = makePrisma(5);
      const service = new HoursRecognitionService(prisma);

      await service.calculateRecognizableHours({
        projectId: PROJECT_ID,
        sprintId: SPRINT_ID,
        participationId: PARTICIPATION_ID,
      });

      const callArgs = aggregate.mock.calls[0][0];
      expect(callArgs.where).toMatchObject({ idParticipacion: PARTICIPATION_ID });
      expect(callArgs.where).not.toHaveProperty('idUsuario');
    });

    it('caso 7: aísla por Sprint — el where relacional exige Tarea.idSprint exacto', async () => {
      const { prisma, aggregate } = makePrisma();
      const service = new HoursRecognitionService(prisma);

      await service.calculateRecognizableHours({
        projectId: PROJECT_ID,
        sprintId: SPRINT_ID,
        participationId: PARTICIPATION_ID,
      });

      const callArgs = aggregate.mock.calls[0][0];
      expect(callArgs.where).toMatchObject({
        tarea: { idProyecto: PROJECT_ID, idSprint: SPRINT_ID },
      });
    });

    it('caso 8: aísla por proyecto — el where relacional exige Tarea.idProyecto exacto', async () => {
      const { prisma, aggregate } = makePrisma();
      const service = new HoursRecognitionService(prisma);

      await service.calculateRecognizableHours({
        projectId: PROJECT_ID,
        sprintId: SPRINT_ID,
        participationId: PARTICIPATION_ID,
      });

      const callArgs = aggregate.mock.calls[0][0];
      expect(callArgs.where?.tarea).toEqual({ idProyecto: PROJECT_ID, idSprint: SPRINT_ID });
    });

    it('caso 9: total vacío — _sum.horasReales null se normaliza a 0 público', async () => {
      const { prisma } = makePrisma(null);
      const service = new HoursRecognitionService(prisma);

      const resultado = await service.calculateRecognizableHours({
        projectId: PROJECT_ID,
        sprintId: SPRINT_ID,
        participationId: PARTICIPATION_ID,
      });

      expect(resultado).toBe(0);
    });

    it('caso 10: una sola consulta de agregación (aggregate), sin findMany', async () => {
      const { prisma, aggregate } = makePrisma(5);
      const findMany = vi.spyOn(prisma.asignacionTarea, 'findMany');
      const service = new HoursRecognitionService(prisma);

      await service.calculateRecognizableHours({
        projectId: PROJECT_ID,
        sprintId: SPRINT_ID,
        participationId: PARTICIPATION_ID,
      });

      expect(aggregate).toHaveBeenCalledTimes(1);
      expect(findMany).not.toHaveBeenCalled();
    });

    it('argumentos: traduce projectId/sprintId/participationId exactamente al where enviado a Prisma', async () => {
      const { prisma, aggregate } = makePrisma();
      const service = new HoursRecognitionService(prisma);

      await service.calculateRecognizableHours({
        projectId: 7,
        sprintId: 8,
        participationId: 9,
      });

      expect(aggregate).toHaveBeenCalledWith({
        where: {
          idParticipacion: 9,
          desasignadaEn: { not: null },
          horasReales: { not: null },
          reconocidoEn: null,
          tarea: { idProyecto: 7, idSprint: 8 },
        },
        _sum: { horasReales: true },
      });
    });

    it.each([
      ['tramo abierto', 'desasignadaEn', { not: null }],
      ['horasReales null', 'horasReales', { not: null }],
      ['tramo ya reconocido', 'reconocidoEn', null],
    ] as const)(
      'excluye %s vía el filtro %s en el where enviado a Prisma',
      async (_escenario, campo, filtroEsperado) => {
        const { prisma, aggregate } = makePrisma();
        const service = new HoursRecognitionService(prisma);

        await service.calculateRecognizableHours({
          projectId: PROJECT_ID,
          sprintId: SPRINT_ID,
          participationId: PARTICIPATION_ID,
        });

        const callArgs = aggregate.mock.calls[0][0];
        expect(callArgs.where?.[campo]).toEqual(filtroEsperado);
      },
    );
  });
});
