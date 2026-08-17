import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TasksService } from '../src/tasks/tasks.service';

function makeTx() {
  return {
    tarea: { update: vi.fn(), findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    tareaEtiqueta: { deleteMany: vi.fn(), createMany: vi.fn() },
    asignacionTarea: undefined,
    // A12: usado exclusivamente por syncHitoEstado cuando la tarea tiene
    // idHito. Por defecto ausente para no romper los tests preexistentes
    // que usan `idHito: null`; cada test A12 lo añade explícitamente.
    hito: undefined,
  };
}

function makePrisma(tx = makeTx()) {
  return {
    tx,
    $transaction: vi.fn(async (callback: any) => callback(tx)),
  } as any;
}

function makeAuthorization(overrides: Record<string, unknown> = {}) {
  return {
    assertCanChangeTaskState: vi.fn().mockResolvedValue({ idTarea: 42, idProyecto: 5 }),
    ...overrides,
  } as any;
}

function makeNotifications() {
  return { notifyFromTemplate: vi.fn().mockResolvedValue(undefined) } as any;
}

function tareaRow(overrides: Record<string, unknown> = {}) {
  return {
    idTarea: 42,
    idProyecto: 5,
    idHito: null,
    idRolProyecto: null,
    tituloTarea: 'Tarea original',
    descripcionTarea: null,
    estadoTarea: 'POR_HACER',
    prioridad: 'MEDIA',
    creadaPor: 1,
    fechaCreacion: new Date('2026-01-01T00:00:00.000Z'),
    fechaLimite: null,
    actualizadaEn: null,
    tiempoEstimadoHoras: null,
    hito: null,
    rolProyecto: null,
    asignaciones: [],
    etiquetas: [],
    _count: { comentarios: 0 },
    ...overrides,
  };
}

function makeService(opts: { prisma?: any; auth?: any; notifications?: any } = {}) {
  const tx = makeTx();
  const prisma = opts.prisma ?? makePrisma(tx);
  const auth = opts.auth ?? makeAuthorization();
  const relations = { validateRelatedResources: vi.fn(), assertUserAssignableToProject: vi.fn() } as any;
  const notifications = opts.notifications ?? makeNotifications();
  const context = { getActiveAssignment: vi.fn() } as any;
  const service = new TasksService(prisma, auth, relations, notifications, context);
  return { tx: prisma.tx, prisma, auth, relations, notifications, context, service };
}

describe('TasksService.updateEstado', () => {
  describe('autorización', () => {
    it('líder permitido: assertCanChangeTaskState resuelve y la escritura procede', async () => {
      const { tx, auth, service } = makeService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow({ estadoTarea: 'EN_PROGRESO' }));

      const result = await service.updateEstado(5, 42, 1, { estadoTarea: 'EN_PROGRESO' } as any);

      expect(auth.assertCanChangeTaskState).toHaveBeenCalledWith(5, 42, 1, tx);
      expect(result.estadoTarea).toBe('EN_PROGRESO');
    });

    it('asignado activo permitido: la escritura procede igual que para el líder', async () => {
      const { tx, service } = makeService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow({ estadoTarea: 'HECHO' }));

      const result = await service.updateEstado(5, 42, 3, { estadoTarea: 'HECHO' } as any);

      expect(result.estadoTarea).toBe('HECHO');
    });

    it('participante activo no asignado: propaga ForbiddenException, no escribe', async () => {
      const { tx, service } = makeService({
        auth: makeAuthorization({
          assertCanChangeTaskState: vi
            .fn()
            .mockRejectedValue(new ForbiddenException('No tienes permiso para realizar esta acción sobre la tarea')),
        }),
      });

      await expect(
        service.updateEstado(5, 42, 7, { estadoTarea: 'EN_PROGRESO' } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(tx.tarea.update).not.toHaveBeenCalled();
    });

    it('usuario externo: propaga ForbiddenException, no escribe', async () => {
      const { tx, service } = makeService({
        auth: makeAuthorization({
          assertCanChangeTaskState: vi.fn().mockRejectedValue(new ForbiddenException('externo')),
        }),
      });

      await expect(
        service.updateEstado(5, 42, 999, { estadoTarea: 'EN_PROGRESO' } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(tx.tarea.update).not.toHaveBeenCalled();
    });

    it('creador de la tarea sin liderazgo ni asignación: propaga ForbiddenException', async () => {
      const { tx, service } = makeService({
        auth: makeAuthorization({
          assertCanChangeTaskState: vi.fn().mockRejectedValue(new ForbiddenException('creador sin permiso')),
        }),
      });

      await expect(
        service.updateEstado(5, 42, 1, { estadoTarea: 'EN_PROGRESO' } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(tx.tarea.update).not.toHaveBeenCalled();
    });

    it('asignado histórico (desasignado): propaga ForbiddenException', async () => {
      const { tx, service } = makeService({
        auth: makeAuthorization({
          assertCanChangeTaskState: vi.fn().mockRejectedValue(new ForbiddenException('histórico')),
        }),
      });

      await expect(
        service.updateEstado(5, 42, 3, { estadoTarea: 'EN_PROGRESO' } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(tx.tarea.update).not.toHaveBeenCalled();
    });

    it('usuario distinto del asignado activo actual: propaga ForbiddenException', async () => {
      const { tx, service } = makeService({
        auth: makeAuthorization({
          assertCanChangeTaskState: vi.fn().mockRejectedValue(new ForbiddenException('no es el asignado actual')),
        }),
      });

      await expect(
        service.updateEstado(5, 42, 4, { estadoTarea: 'EN_PROGRESO' } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(tx.tarea.update).not.toHaveBeenCalled();
    });

    it('tarea sin asignación: rechaza a un no líder', async () => {
      const { tx, service } = makeService({
        auth: makeAuthorization({
          assertCanChangeTaskState: vi.fn().mockRejectedValue(new ForbiddenException('sin asignación')),
        }),
      });

      await expect(
        service.updateEstado(5, 42, 3, { estadoTarea: 'EN_PROGRESO' } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(tx.tarea.update).not.toHaveBeenCalled();
    });

    it('tarea inexistente: propaga NotFoundException', async () => {
      const { tx, service } = makeService({
        auth: makeAuthorization({
          assertCanChangeTaskState: vi
            .fn()
            .mockRejectedValue(new NotFoundException('Tarea con id 999 no encontrada en el proyecto 5')),
        }),
      });

      await expect(
        service.updateEstado(5, 999, 1, { estadoTarea: 'EN_PROGRESO' } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.tarea.update).not.toHaveBeenCalled();
    });

    it('tarea eliminada: propaga NotFoundException', async () => {
      const { tx, service } = makeService({
        auth: makeAuthorization({
          assertCanChangeTaskState: vi
            .fn()
            .mockRejectedValue(new NotFoundException('Tarea con id 42 no encontrada en el proyecto 5')),
        }),
      });

      await expect(
        service.updateEstado(5, 42, 1, { estadoTarea: 'EN_PROGRESO' } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.tarea.update).not.toHaveBeenCalled();
    });

    it('tarea de otro proyecto: propaga NotFoundException', async () => {
      const { tx, service } = makeService({
        auth: makeAuthorization({
          assertCanChangeTaskState: vi
            .fn()
            .mockRejectedValue(new NotFoundException('Tarea con id 42 no encontrada en el proyecto 1')),
        }),
      });

      await expect(
        service.updateEstado(1, 42, 1, { estadoTarea: 'EN_PROGRESO' } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.tarea.update).not.toHaveBeenCalled();
    });

    it('usa el mismo cliente transaccional en autorización y en la escritura', async () => {
      const { tx, auth, service } = makeService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      await service.updateEstado(5, 42, 1, { estadoTarea: 'EN_PROGRESO' } as any);

      expect(auth.assertCanChangeTaskState).toHaveBeenCalledWith(5, 42, 1, tx);
      expect(tx.tarea.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { idTarea: 42 } }),
      );
    });
  });

  describe('transiciones libres (sin máquina de estados)', () => {
    const CASOS: Array<[string, string]> = [
      ['POR_HACER', 'POR_HACER'],
      ['POR_HACER', 'EN_PROGRESO'],
      ['POR_HACER', 'EN_REVISION'],
      ['POR_HACER', 'HECHO'],
      ['EN_PROGRESO', 'POR_HACER'],
      ['EN_PROGRESO', 'EN_PROGRESO'],
      ['EN_PROGRESO', 'EN_REVISION'],
      ['EN_PROGRESO', 'HECHO'],
      ['EN_REVISION', 'POR_HACER'],
      ['EN_REVISION', 'EN_PROGRESO'],
      ['EN_REVISION', 'EN_REVISION'],
      ['EN_REVISION', 'HECHO'],
      ['HECHO', 'POR_HACER'],
      ['HECHO', 'EN_PROGRESO'],
      ['HECHO', 'EN_REVISION'],
      ['HECHO', 'HECHO'],
    ];

    it.each(CASOS)('%s → %s se permite y se escribe tal cual', async (desde, hacia) => {
      const { tx, service } = makeService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow({ estadoTarea: hacia }));

      const result = await service.updateEstado(5, 42, 1, { estadoTarea: hacia } as any);

      expect(tx.tarea.update).toHaveBeenCalledWith({
        where: { idTarea: 42 },
        data: { estadoTarea: hacia },
      });
      expect(result.estadoTarea).toBe(hacia);
      void desde; // el estado previo es irrelevante: no existe máquina de transición.
    });

    it('un retroceso explícito (HECHO → POR_HACER) no es rechazado ni transformado', async () => {
      const { tx, service } = makeService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow({ estadoTarea: 'POR_HACER' }));

      const result = await service.updateEstado(5, 42, 1, { estadoTarea: 'POR_HACER' } as any);

      expect(tx.tarea.update).toHaveBeenCalledWith({
        where: { idTarea: 42 },
        data: { estadoTarea: 'POR_HACER' },
      });
      expect(result.estadoTarea).toBe('POR_HACER');
    });

    it('un salto directo (POR_HACER → HECHO) no exige pasar por estados intermedios', async () => {
      const { tx, service } = makeService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow({ estadoTarea: 'HECHO' }));

      await service.updateEstado(5, 42, 1, { estadoTarea: 'HECHO' } as any);

      expect(tx.tarea.update).toHaveBeenCalledWith({
        where: { idTarea: 42 },
        data: { estadoTarea: 'HECHO' },
      });
    });

    it('el mismo estado (idempotente) también se acepta y se escribe', async () => {
      const { tx, service } = makeService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow({ estadoTarea: 'EN_REVISION' }));

      await service.updateEstado(5, 42, 1, { estadoTarea: 'EN_REVISION' } as any);

      expect(tx.tarea.update).toHaveBeenCalledWith({
        where: { idTarea: 42 },
        data: { estadoTarea: 'EN_REVISION' },
      });
    });
  });

  describe('escritura', () => {
    it('abre exactamente una transacción', async () => {
      const { prisma, tx, service } = makeService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      await service.updateEstado(5, 42, 1, { estadoTarea: 'EN_PROGRESO' } as any);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('data enviada a tarea.update contiene únicamente estadoTarea', async () => {
      const { tx, service } = makeService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      await service.updateEstado(5, 42, 1, { estadoTarea: 'EN_PROGRESO' } as any);

      const data = tx.tarea.update.mock.calls[0][0].data;
      expect(Object.keys(data)).toEqual(['estadoTarea']);
    });

    it('no toca TareaEtiqueta', async () => {
      const { tx, service } = makeService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      await service.updateEstado(5, 42, 1, { estadoTarea: 'EN_PROGRESO' } as any);

      expect(tx.tareaEtiqueta.deleteMany).not.toHaveBeenCalled();
      expect(tx.tareaEtiqueta.createMany).not.toHaveBeenCalled();
    });

    it('no toca AsignacionTarea (el tx usado ni siquiera expone ese modelo)', async () => {
      const { tx, service } = makeService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      await service.updateEstado(5, 42, 1, { estadoTarea: 'EN_PROGRESO' } as any);

      expect((tx as any).asignacionTarea).toBeUndefined();
    });

    it('no llama a NotificationsService.notifyFromTemplate', async () => {
      const { tx, notifications, service } = makeService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      await service.updateEstado(5, 42, 1, { estadoTarea: 'EN_PROGRESO' } as any);

      expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
    });

    it('la lectura final usa idTarea + idProyecto + eliminadoEn: null', async () => {
      const { tx, service } = makeService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      await service.updateEstado(5, 42, 1, { estadoTarea: 'EN_PROGRESO' } as any);

      expect(tx.tarea.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { idTarea: 42, idProyecto: 5, eliminadoEn: null } }),
      );
    });

    it('la respuesta coincide con el contrato público de creación/listado/detalle/edición', async () => {
      const { tx, service } = makeService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow({ estadoTarea: 'HECHO' }));

      const result = await service.updateEstado(5, 42, 1, { estadoTarea: 'HECHO' } as any);

      expect(Object.keys(result).sort()).toEqual(
        [
          'idTarea',
          'idProyecto',
          'idHito',
          'idRolProyecto',
          'tituloTarea',
          'descripcionTarea',
          'estadoTarea',
          'prioridad',
          'creadaPor',
          'fechaCreacion',
          'fechaLimite',
          'actualizadaEn',
          'tiempoEstimadoHoras',
          'asignacionActiva',
          'rolProyecto',
          'hito',
          'etiquetas',
          'cantidadComentarios',
        ].sort(),
      );
      expect(result).not.toHaveProperty('eliminadoEn');
      expect(result).not.toHaveProperty('_count');
      expect(result.estadoTarea).toBe('HECHO');
    });
  });

  describe('orden transaccional', () => {
    it('respeta: autorización → update → lectura final → fin de transacción', async () => {
      const orden: string[] = [];
      const tx = makeTx();
      const prisma = makePrisma(tx);
      const auth = {
        assertCanChangeTaskState: vi.fn(async () => {
          orden.push('autorizacion');
          return { idTarea: 42, idProyecto: 5 };
        }),
      } as any;
      tx.tarea.update.mockImplementation(async () => {
        orden.push('update');
      });
      tx.tarea.findFirst.mockImplementation(async () => {
        orden.push('lectura_final');
        return tareaRow();
      });
      const relations = {} as any;
      const notifications = makeNotifications();
      const context = {} as any;
      const service = new TasksService(prisma, auth, relations, notifications, context);

      await service.updateEstado(5, 42, 1, { estadoTarea: 'EN_PROGRESO' } as any);
      orden.push('fin_transaccion');

      expect(orden).toEqual(['autorizacion', 'update', 'lectura_final', 'fin_transaccion']);
    });
  });

  describe('fallos y rollback', () => {
    it('autorización fallida: no llama a update ni a la lectura final', async () => {
      const { tx, service } = makeService({
        auth: makeAuthorization({
          assertCanChangeTaskState: vi.fn().mockRejectedValue(new ForbiddenException('no autorizado')),
        }),
      });

      await expect(
        service.updateEstado(5, 42, 1, { estadoTarea: 'EN_PROGRESO' } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(tx.tarea.update).not.toHaveBeenCalled();
      expect(tx.tarea.findFirst).not.toHaveBeenCalled();
    });

    it('fallo en tarea.update: no se realiza la lectura final', async () => {
      const { tx, service } = makeService();
      tx.tarea.update.mockRejectedValue(new Error('fallo de escritura'));

      await expect(
        service.updateEstado(5, 42, 1, { estadoTarea: 'EN_PROGRESO' } as any),
      ).rejects.toThrow('fallo de escritura');

      expect(tx.tarea.findFirst).not.toHaveBeenCalled();
    });

    it('lectura final nula: lanza dentro de la transacción (rollback)', async () => {
      const { service, tx } = makeService();
      tx.tarea.findFirst.mockResolvedValue(null);

      await expect(
        service.updateEstado(5, 42, 1, { estadoTarea: 'EN_PROGRESO' } as any),
      ).rejects.toThrow();
    });

    it('lectura final con error: se propaga, ninguna notificación se intenta', async () => {
      const { tx, notifications, service } = makeService();
      tx.tarea.findFirst.mockRejectedValue(new Error('fallo de lectura'));

      await expect(
        service.updateEstado(5, 42, 1, { estadoTarea: 'EN_PROGRESO' } as any),
      ).rejects.toThrow('fallo de lectura');

      expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
    });

    it('ninguna escritura usa PrismaService fuera de tx', async () => {
      const { prisma, tx, service } = makeService();
      tx.tarea.update.mockRejectedValue(new Error('fallo'));

      await expect(
        service.updateEstado(5, 42, 1, { estadoTarea: 'EN_PROGRESO' } as any),
      ).rejects.toThrow('fallo');

      expect(prisma.tarea).toBeUndefined();
      expect(prisma.tareaEtiqueta).toBeUndefined();
      expect(prisma.asignacionTarea).toBeUndefined();
    });
  });

  describe('atomicidad: asignación revocada entre llamadas', () => {
    it('primera llamada permitida (asignado activo), segunda llamada rechazada tras revocar la asignación', async () => {
      const { tx, auth, service } = makeService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow({ estadoTarea: 'EN_PROGRESO' }));
      auth.assertCanChangeTaskState.mockResolvedValueOnce({ idTarea: 42, idProyecto: 5 });

      await expect(
        service.updateEstado(5, 42, 3, { estadoTarea: 'EN_PROGRESO' } as any),
      ).resolves.toBeDefined();

      auth.assertCanChangeTaskState.mockRejectedValueOnce(
        new ForbiddenException('No tienes permiso para realizar esta acción sobre la tarea'),
      );
      tx.tarea.update.mockClear();

      await expect(
        service.updateEstado(5, 42, 3, { estadoTarea: 'HECHO' } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(tx.tarea.update).not.toHaveBeenCalled();
    });
  });

  describe('A12 — sincronización de Hito.estadoHito tras updateEstado', () => {
    it('tarea con idHito: persiste Hito.estadoHito=COMPLETADO cuando todas sus tareas quedan HECHO, dentro de la MISMA transacción', async () => {
      const tx = makeTx();
      tx.hito = { update: vi.fn() } as any;
      tx.tarea.findFirst.mockResolvedValue(tareaRow({ idHito: 7, estadoTarea: 'HECHO' }));
      // Progreso real del Hito tras el cambio: 1 sola tarea, ya HECHO -> 100%.
      tx.tarea.findMany.mockResolvedValue([{ idHito: 7, estadoTarea: 'HECHO' }]);
      const prisma = makePrisma(tx);
      const auth = makeAuthorization();
      const notifications = makeNotifications();
      const relations = {} as any;
      const context = {} as any;
      const service = new TasksService(prisma, auth, relations, notifications, context);

      await service.updateEstado(5, 42, 1, { estadoTarea: 'HECHO' } as any);

      expect(tx.hito.update).toHaveBeenCalledWith({
        where: { idHito: 7 },
        data: { estadoHito: 'COMPLETADO' },
      });
      // La consulta que alimenta el cálculo está acotada por idHito
      // (nunca todos los Hitos del proyecto/base) + eliminadoEn: null.
      expect(tx.tarea.findMany).toHaveBeenCalledWith({
        where: { idHito: 7, eliminadoEn: null },
        select: { estadoTarea: true },
      });
    });

    it('tarea con idHito: persiste EN_PROGRESO cuando el progreso del Hito es parcial', async () => {
      const tx = makeTx();
      tx.hito = { update: vi.fn() } as any;
      tx.tarea.findFirst.mockResolvedValue(tareaRow({ idHito: 7, estadoTarea: 'EN_PROGRESO' }));
      tx.tarea.findMany.mockResolvedValue([
        { idHito: 7, estadoTarea: 'HECHO' },
        { idHito: 7, estadoTarea: 'EN_PROGRESO' },
      ]);
      const prisma = makePrisma(tx);
      const service = new TasksService(prisma, makeAuthorization(), {} as any, makeNotifications(), {} as any);

      await service.updateEstado(5, 42, 1, { estadoTarea: 'EN_PROGRESO' } as any);

      expect(tx.hito.update).toHaveBeenCalledWith({
        where: { idHito: 7 },
        data: { estadoHito: 'EN_PROGRESO' },
      });
    });

    it('tarea con idHito: persiste PENDIENTE cuando ninguna tarea del Hito está HECHO', async () => {
      const tx = makeTx();
      tx.hito = { update: vi.fn() } as any;
      tx.tarea.findFirst.mockResolvedValue(tareaRow({ idHito: 7, estadoTarea: 'POR_HACER' }));
      tx.tarea.findMany.mockResolvedValue([{ idHito: 7, estadoTarea: 'POR_HACER' }]);
      const prisma = makePrisma(tx);
      const service = new TasksService(prisma, makeAuthorization(), {} as any, makeNotifications(), {} as any);

      await service.updateEstado(5, 42, 1, { estadoTarea: 'POR_HACER' } as any);

      expect(tx.hito.update).toHaveBeenCalledWith({
        where: { idHito: 7 },
        data: { estadoHito: 'PENDIENTE' },
      });
    });

    it('tarea SIN Hito (idHito: null): la mutación de estado funciona normalmente y nunca intenta hito.update', async () => {
      const { tx, service } = makeService();
      // tx.hito permanece undefined (default de makeTx()): si el código
      // intentara sincronizar un Hito aquí, esta llamada fallaría con
      // TypeError antes de completarse.
      tx.tarea.findFirst.mockResolvedValue(tareaRow({ idHito: null, estadoTarea: 'EN_PROGRESO' }));

      const result = await service.updateEstado(5, 42, 1, { estadoTarea: 'EN_PROGRESO' } as any);

      expect(result.estadoTarea).toBe('EN_PROGRESO');
      expect(tx.tarea.findMany).not.toHaveBeenCalled();
    });
  });
});
