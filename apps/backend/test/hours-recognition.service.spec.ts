import { describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
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

/**
 * Prisma "raíz" instrumentado con spies en los mismos métodos que
 * `recognizeParticipationHours` debería usar exclusivamente vía `tx` —
 * permite demostrar explícitamente que ninguna operación productiva toca
 * `this.prisma`, ni siquiera por accidente.
 */
function makeRootPrismaSpy() {
  const prisma = new PrismaService();
  const asignacionTareaFindMany = vi.fn();
  const asignacionTareaUpdateMany = vi.fn();
  const horasParticipacionFindFirst = vi.fn();
  const horasParticipacionCreate = vi.fn();
  const horasParticipacionUpdate = vi.fn();
  Reflect.set(prisma.asignacionTarea, 'findMany', asignacionTareaFindMany);
  Reflect.set(prisma.asignacionTarea, 'updateMany', asignacionTareaUpdateMany);
  Reflect.set(prisma, 'horasParticipacion', {
    findFirst: horasParticipacionFindFirst,
    create: horasParticipacionCreate,
    update: horasParticipacionUpdate,
  });
  return {
    prisma,
    spies: {
      asignacionTareaFindMany,
      asignacionTareaUpdateMany,
      horasParticipacionFindFirst,
      horasParticipacionCreate,
      horasParticipacionUpdate,
    },
  };
}

function tramo(idAsignacion: number, horasReales: number) {
  return { idAsignacion, horasReales: new Prisma.Decimal(horasReales) };
}

function makeTx() {
  return {
    asignacionTarea: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    horasParticipacion: {
      findFirst: vi.fn().mockResolvedValue(null),
      findFirstOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
}

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

  describe('recognizeParticipationHours (SYNC GATE 1)', () => {
    const INPUT = { projectId: PROJECT_ID, sprintId: SPRINT_ID, participationId: PARTICIPATION_ID };

    function makeHorasParticipacionCollisionError() {
      return new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`id_participacion`,`id_sprint`)',
        {
          code: 'P2002',
          clientVersion: '6.19.2',
          meta: { modelName: 'HorasParticipacion', target: ['id_participacion', 'id_sprint'] },
        },
      );
    }

    it('caso 1: sin tramos elegibles — no-op real, sin tocar AsignacionTarea ni HorasParticipacion', async () => {
      const { prisma } = makeRootPrismaSpy();
      const tx = makeTx();
      tx.asignacionTarea.findMany.mockResolvedValue([]);
      const service = new HoursRecognitionService(prisma);

      const resultado = await service.recognizeParticipationHours(tx as unknown as Prisma.TransactionClient, INPUT);

      expect(resultado).toEqual({
        horasReconocidas: 0,
        idsAsignacionesReconocidas: [],
        horasParticipacion: null,
      });
      expect(tx.asignacionTarea.updateMany).not.toHaveBeenCalled();
      expect(tx.horasParticipacion.findFirst).not.toHaveBeenCalled();
      expect(tx.horasParticipacion.create).not.toHaveBeenCalled();
    });

    it('caso 2: crea HorasParticipacion cuando no existe fila previa — horasCalculadas = suma real', async () => {
      const { prisma } = makeRootPrismaSpy();
      const tx = makeTx();
      tx.asignacionTarea.findMany.mockResolvedValue([tramo(1, 3), tramo(2, 2)]);
      tx.asignacionTarea.updateMany.mockResolvedValue({ count: 2 });
      tx.horasParticipacion.findFirst.mockResolvedValue(null);
      const filaCreada = { idRegistroHoras: 500, idParticipacion: PARTICIPATION_ID, idSprint: SPRINT_ID };
      tx.horasParticipacion.create.mockResolvedValue(filaCreada);
      const service = new HoursRecognitionService(prisma);

      const resultado = await service.recognizeParticipationHours(tx as unknown as Prisma.TransactionClient, INPUT);

      expect(resultado.horasReconocidas).toBe(5);
      expect(resultado.idsAsignacionesReconocidas).toEqual([1, 2]);
      expect(resultado.horasParticipacion).toBe(filaCreada);
      expect(tx.horasParticipacion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          idParticipacion: PARTICIPATION_ID,
          idSprint: SPRINT_ID,
          horasReportadas: expect.any(Prisma.Decimal),
          horasCalculadas: expect.any(Prisma.Decimal),
        }),
      });
      const dataEnviada = tx.horasParticipacion.create.mock.calls[0][0].data;
      expect(dataEnviada.horasCalculadas.toNumber()).toBe(5);
    });

    it('caso 3: incrementa (nunca sobrescribe) HorasParticipacion.horasCalculadas cuando ya existe fila', async () => {
      const { prisma } = makeRootPrismaSpy();
      const tx = makeTx();
      tx.asignacionTarea.findMany.mockResolvedValue([tramo(3, 4)]);
      tx.asignacionTarea.updateMany.mockResolvedValue({ count: 1 });
      const filaExistente = {
        idRegistroHoras: 501,
        idParticipacion: PARTICIPATION_ID,
        idSprint: SPRINT_ID,
        horasCalculadas: new Prisma.Decimal(10),
      };
      tx.horasParticipacion.findFirst.mockResolvedValue(filaExistente);
      tx.horasParticipacion.update.mockResolvedValue({ ...filaExistente, horasCalculadas: new Prisma.Decimal(14) });
      const service = new HoursRecognitionService(prisma);

      const resultado = await service.recognizeParticipationHours(tx as unknown as Prisma.TransactionClient, INPUT);

      expect(resultado.horasReconocidas).toBe(4);
      expect(tx.horasParticipacion.update).toHaveBeenCalledWith({
        where: { idRegistroHoras: 501 },
        data: { horasCalculadas: { increment: expect.any(Prisma.Decimal) } },
      });
      const incremento = tx.horasParticipacion.update.mock.calls[0][0].data.horasCalculadas.increment;
      expect(incremento.toNumber()).toBe(4);
      expect(tx.horasParticipacion.create).not.toHaveBeenCalled();
    });

    it('caso 4 (A6): la marca usa updateMany condicionado por reconocidoEn: null en el WHERE — nunca find->if->update', async () => {
      const { prisma } = makeRootPrismaSpy();
      const tx = makeTx();
      tx.asignacionTarea.findMany.mockResolvedValue([tramo(7, 1), tramo(8, 1)]);
      tx.asignacionTarea.updateMany.mockResolvedValue({ count: 2 });
      tx.horasParticipacion.create.mockResolvedValue({ idRegistroHoras: 1 });
      const service = new HoursRecognitionService(prisma);

      await service.recognizeParticipationHours(tx as unknown as Prisma.TransactionClient, INPUT);

      expect(tx.asignacionTarea.updateMany).toHaveBeenCalledWith({
        where: { idAsignacion: { in: [7, 8] }, reconocidoEn: null },
        data: { reconocidoEn: expect.any(Date) },
      });
    });

    it('caso 5: carrera — count de la marca no coincide con los tramos detectados -> ConflictException, sin tocar HorasParticipacion', async () => {
      const { prisma } = makeRootPrismaSpy();
      const tx = makeTx();
      tx.asignacionTarea.findMany.mockResolvedValue([tramo(1, 3), tramo(2, 2)]);
      // Otra transacción ya reconoció uno de los dos tramos detectados.
      tx.asignacionTarea.updateMany.mockResolvedValue({ count: 1 });
      const service = new HoursRecognitionService(prisma);

      await expect(service.recognizeParticipationHours(tx as unknown as Prisma.TransactionClient, INPUT)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(tx.horasParticipacion.findFirst).not.toHaveBeenCalled();
      expect(tx.horasParticipacion.create).not.toHaveBeenCalled();
      expect(tx.horasParticipacion.update).not.toHaveBeenCalled();
    });

    it('caso 6: colisión P2002 al crear (otra tx ganó la carrera de creación) — reintenta como increment sobre la fila ganadora', async () => {
      const { prisma } = makeRootPrismaSpy();
      const tx = makeTx();
      tx.asignacionTarea.findMany.mockResolvedValue([tramo(9, 6)]);
      tx.asignacionTarea.updateMany.mockResolvedValue({ count: 1 });
      tx.horasParticipacion.findFirst.mockResolvedValue(null);
      tx.horasParticipacion.create.mockRejectedValue(makeHorasParticipacionCollisionError());
      const filaGanadora = { idRegistroHoras: 777, horasCalculadas: new Prisma.Decimal(2) };
      tx.horasParticipacion.findFirstOrThrow.mockResolvedValue(filaGanadora);
      tx.horasParticipacion.update.mockResolvedValue({ ...filaGanadora, horasCalculadas: new Prisma.Decimal(8) });
      const service = new HoursRecognitionService(prisma);

      const resultado = await service.recognizeParticipationHours(tx as unknown as Prisma.TransactionClient, INPUT);

      expect(tx.horasParticipacion.update).toHaveBeenCalledWith({
        where: { idRegistroHoras: 777 },
        data: { horasCalculadas: { increment: expect.any(Prisma.Decimal) } },
      });
      expect(resultado.horasParticipacion).toEqual({ ...filaGanadora, horasCalculadas: new Prisma.Decimal(8) });
    });

    it('caso 7: transaction client supplied — todas las operaciones usan tx, ninguna usa this.prisma raíz', async () => {
      const { prisma, spies } = makeRootPrismaSpy();
      const tx = makeTx();
      tx.asignacionTarea.findMany.mockResolvedValue([tramo(1, 3)]);
      tx.asignacionTarea.updateMany.mockResolvedValue({ count: 1 });
      tx.horasParticipacion.create.mockResolvedValue({ idRegistroHoras: 1 });
      const service = new HoursRecognitionService(prisma);

      await service.recognizeParticipationHours(tx as unknown as Prisma.TransactionClient, INPUT);

      expect(tx.asignacionTarea.findMany).toHaveBeenCalled();
      expect(tx.asignacionTarea.updateMany).toHaveBeenCalled();
      expect(tx.horasParticipacion.create).toHaveBeenCalled();
      expect(spies.asignacionTareaFindMany).not.toHaveBeenCalled();
      expect(spies.asignacionTareaUpdateMany).not.toHaveBeenCalled();
      expect(spies.horasParticipacionFindFirst).not.toHaveBeenCalled();
      expect(spies.horasParticipacionCreate).not.toHaveBeenCalled();
      expect(spies.horasParticipacionUpdate).not.toHaveBeenCalled();
    });

    it('caso 8: no abre una segunda $transaction — recognizeParticipationHours nunca llama a this.prisma.$transaction', async () => {
      const { prisma } = makeRootPrismaSpy();
      const transactionSpy = vi.fn();
      Reflect.set(prisma, '$transaction', transactionSpy);
      const tx = makeTx();
      tx.asignacionTarea.findMany.mockResolvedValue([]);
      const service = new HoursRecognitionService(prisma);

      await service.recognizeParticipationHours(tx as unknown as Prisma.TransactionClient, INPUT);

      expect(transactionSpy).not.toHaveBeenCalled();
    });

    it('caso 9: usa el mismo where de elegibilidad que calculateRecognizableHours (idParticipacion/desasignadaEn/horasReales/reconocidoEn/tarea)', async () => {
      const { prisma } = makeRootPrismaSpy();
      const tx = makeTx();
      tx.asignacionTarea.findMany.mockResolvedValue([]);
      const service = new HoursRecognitionService(prisma);

      await service.recognizeParticipationHours(tx as unknown as Prisma.TransactionClient, { projectId: 7, sprintId: 8, participationId: 9 });

      expect(tx.asignacionTarea.findMany).toHaveBeenCalledWith({
        where: {
          idParticipacion: 9,
          desasignadaEn: { not: null },
          horasReales: { not: null },
          reconocidoEn: null,
          tarea: { idProyecto: 7, idSprint: 8 },
        },
        select: { idAsignacion: true, horasReales: true },
      });
    });
  });
});
