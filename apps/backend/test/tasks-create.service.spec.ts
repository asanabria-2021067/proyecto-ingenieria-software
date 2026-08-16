import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TasksService } from '../src/tasks/tasks.service';

function makeTx() {
  return {
    // A12.1: findMany se usa exclusivamente por syncHitoEstado cuando la
    // tarea creada tiene idHito != null. Por defecto [] para no romper los
    // tests preexistentes (idHito: null en tareaRow() por defecto).
    tarea: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    asignacionTarea: { create: vi.fn() },
    tareaEtiqueta: { createMany: vi.fn() },
    // Por defecto el proyecto tiene un Sprint ACTIVO (FND-03.B): los tests
    // que necesitan probar el rechazo por falta de Sprint sobreescriben
    // este mock explícitamente con mockResolvedValue(null).
    sprint: { findFirst: vi.fn().mockResolvedValue({ idSprint: 1 }) },
    // A12.1: presente únicamente en los tests que crean una tarea con
    // idHito != null; ausente (undefined) en el resto.
    hito: undefined as { update: ReturnType<typeof vi.fn> } | undefined,
  };
}

function makePrisma(tx = makeTx()) {
  return {
    tx,
    $transaction: vi.fn(async (callback: any) => callback(tx)),
    usuario: { findUnique: vi.fn() },
    proyecto: { findUnique: vi.fn() },
  } as any;
}

function makeAuthorization() {
  return { assertCanCreateTask: vi.fn().mockResolvedValue(undefined) } as any;
}

function makeRelations(overrides: Record<string, unknown> = {}) {
  return {
    validateCreateTaskRelations: vi.fn().mockResolvedValue({
      hito: undefined,
      rolProyecto: undefined,
      etiquetas: undefined,
      ...overrides,
    }),
  } as any;
}

function makeNotifications() {
  return {
    notifyFromTemplate: vi.fn().mockResolvedValue(undefined),
    notifyUsers: vi.fn().mockResolvedValue(undefined),
    notifyRoleMembers: vi.fn().mockResolvedValue(undefined),
  } as any;
}

const BASE_DTO = {
  tituloTarea: 'Nueva tarea',
  fechaLimite: '2026-12-25',
  prioridad: 'MEDIA',
} as any;

function tareaRow(overrides: Record<string, unknown> = {}) {
  return {
    idTarea: 100,
    idProyecto: 5,
    idHito: null,
    idRolProyecto: null,
    tituloTarea: 'Nueva tarea',
    descripcionTarea: null,
    estadoTarea: 'POR_HACER',
    prioridad: 'MEDIA',
    creadaPor: 1,
    fechaCreacion: new Date('2026-01-01T00:00:00.000Z'),
    fechaLimite: new Date('2026-12-25T00:00:00.000Z'),
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

describe('TasksService.create', () => {
  describe('creación mínima (sin asignado, etiquetas, hito ni rol)', () => {
    it('crea la tarea dentro de una transacción y no crea asignación ni asociaciones', async () => {
      const tx = makeTx();
      const prisma = makePrisma(tx);
      const auth = makeAuthorization();
      const relations = makeRelations();
      const notifications = makeNotifications();
      tx.tarea.create.mockResolvedValue({ idTarea: 100 });
      tx.tarea.findFirst.mockResolvedValue(tareaRow());
      const service = new TasksService(prisma, auth, relations, notifications);

      const result = await service.create(5, 1, BASE_DTO);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(auth.assertCanCreateTask).toHaveBeenCalledWith(5, 1, tx);
      expect(relations.validateCreateTaskRelations).toHaveBeenCalledWith(5, BASE_DTO, tx);
      expect(tx.tarea.create).toHaveBeenCalledTimes(1);
      expect(tx.asignacionTarea.create).not.toHaveBeenCalled();
      expect(tx.tareaEtiqueta.createMany).not.toHaveBeenCalled();
      expect(tx.tarea.findFirst).toHaveBeenCalledTimes(1);
      expect(result.idTarea).toBe(100);
      expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
    });

    it('el estado inicial es POR_HACER, establecido explícitamente', async () => {
      const tx = makeTx();
      const prisma = makePrisma(tx);
      const service = new TasksService(prisma, makeAuthorization(), makeRelations(), makeNotifications());
      tx.tarea.create.mockResolvedValue({ idTarea: 100 });
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      await service.create(5, 1, BASE_DTO);

      expect(tx.tarea.create.mock.calls[0][0].data.estadoTarea).toBe('POR_HACER');
    });

    it('descripcionTarea omitida se convierte en null; enviada como cadena vacía se conserva', async () => {
      const tx = makeTx();
      const prisma = makePrisma(tx);
      const service = new TasksService(prisma, makeAuthorization(), makeRelations(), makeNotifications());
      tx.tarea.create.mockResolvedValue({ idTarea: 100 });
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      await service.create(5, 1, BASE_DTO);
      expect(tx.tarea.create.mock.calls[0][0].data.descripcionTarea).toBeNull();

      tx.tarea.create.mockClear();
      await service.create(5, 1, { ...BASE_DTO, descripcionTarea: '' });
      expect(tx.tarea.create.mock.calls[0][0].data.descripcionTarea).toBe('');
    });

    it('tiempoEstimadoHoras omitido se convierte en null', async () => {
      const tx = makeTx();
      const prisma = makePrisma(tx);
      const service = new TasksService(prisma, makeAuthorization(), makeRelations(), makeNotifications());
      tx.tarea.create.mockResolvedValue({ idTarea: 100 });
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      await service.create(5, 1, BASE_DTO);

      expect(tx.tarea.create.mock.calls[0][0].data.tiempoEstimadoHoras).toBeNull();
    });

    it('sin hito/rol validados, idHito e idRolProyecto se envían como null', async () => {
      const tx = makeTx();
      const prisma = makePrisma(tx);
      const service = new TasksService(prisma, makeAuthorization(), makeRelations(), makeNotifications());
      tx.tarea.create.mockResolvedValue({ idTarea: 100 });
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      await service.create(5, 1, BASE_DTO);

      const data = tx.tarea.create.mock.calls[0][0].data;
      expect(data.idHito).toBeNull();
      expect(data.idRolProyecto).toBeNull();
    });
  });

  describe('resolución del Sprint activo (FND-03.B)', () => {
    it('con Sprint ACTIVO: asigna activeSprint.idSprint a la tarea creada', async () => {
      const tx = makeTx();
      tx.sprint.findFirst.mockResolvedValue({ idSprint: 77 });
      const prisma = makePrisma(tx);
      const service = new TasksService(prisma, makeAuthorization(), makeRelations(), makeNotifications());
      tx.tarea.create.mockResolvedValue({ idTarea: 100 });
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      await service.create(5, 1, BASE_DTO);

      expect(tx.sprint.findFirst).toHaveBeenCalledWith({
        where: { idProyecto: 5, estado: 'ACTIVO' },
        select: { idSprint: true },
      });
      expect(tx.tarea.create.mock.calls[0][0].data.idSprint).toBe(77);
    });

    it('sin Sprint ACTIVO (ninguno o solo EN_FINALIZACION/CERRADO, filtrado por la propia query): ConflictException, no crea la tarea', async () => {
      const tx = makeTx();
      tx.sprint.findFirst.mockResolvedValue(null);
      const prisma = makePrisma(tx);
      const service = new TasksService(prisma, makeAuthorization(), makeRelations(), makeNotifications());

      await expect(service.create(5, 1, BASE_DTO)).rejects.toThrow(
        'No se pueden crear tareas porque el proyecto no tiene un Sprint activo.',
      );
      expect(tx.tarea.create).not.toHaveBeenCalled();
    });

    it('aísla la búsqueda al proyecto de la tarea (no a un Sprint ACTIVO de otro proyecto)', async () => {
      const tx = makeTx();
      // Sprint ACTIVO real, pero de un proyecto distinto: el mock simula
      // exactamente lo que Postgres devolvería para ese WHERE (nada), ya
      // que la query siempre incluye idProyecto = projectId.
      tx.sprint.findFirst.mockImplementation(({ where }: any) =>
        Promise.resolve(where.idProyecto === 999 ? { idSprint: 77 } : null),
      );
      const prisma = makePrisma(tx);
      const service = new TasksService(prisma, makeAuthorization(), makeRelations(), makeNotifications());

      await expect(service.create(5, 1, BASE_DTO)).rejects.toThrow(
        'No se pueden crear tareas porque el proyecto no tiene un Sprint activo.',
      );
      expect(tx.sprint.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { idProyecto: 5, estado: 'ACTIVO' } }),
      );
      expect(tx.tarea.create).not.toHaveBeenCalled();
    });
  });

  describe('creación completa (hito, rol, múltiples etiquetas, asignado, tiempo estimado)', () => {
    const HITO_VALIDADO = { idHito: 4, idProyecto: 5, tituloHito: 'MVP' };
    const ROL_VALIDADO = { idRolProyecto: 6, idProyecto: 5, nombreRol: 'Fullstack' };
    const ETIQUETAS_VALIDADAS = [
      { idEtiqueta: 1, idProyecto: 5, nombreEtiqueta: 'backend', nombreNormalizado: 'backend', color: '#10B981' },
      { idEtiqueta: 2, idProyecto: 5, nombreEtiqueta: 'urgente', nombreNormalizado: 'urgente', color: '#EF4444' },
    ];
    const DTO_COMPLETO = {
      ...BASE_DTO,
      idHito: 4,
      idRolProyecto: 6,
      idsEtiquetas: [1, 2],
      idUsuarioAsignado: 3,
      tiempoEstimadoHoras: 8,
    };

    function makeFullSetup() {
      const tx = makeTx();
      const prisma = makePrisma(tx);
      const auth = makeAuthorization();
      const relations = makeRelations({
        hito: HITO_VALIDADO,
        rolProyecto: ROL_VALIDADO,
        etiquetas: ETIQUETAS_VALIDADAS,
      });
      const notifications = makeNotifications();
      // A12.1: la tarea creada aquí tiene idHito=4, así que create()
      // sincroniza ese Hito — necesita hito.update disponible en el tx.
      tx.hito = { update: vi.fn() };
      tx.tarea.create.mockResolvedValue({ idTarea: 100 });
      tx.tarea.findFirst.mockResolvedValue(
        tareaRow({
          idHito: 4,
          idRolProyecto: 6,
          tiempoEstimadoHoras: 8,
          hito: { idHito: 4, tituloHito: 'MVP' },
          rolProyecto: { idRolProyecto: 6, nombreRol: 'Fullstack' },
          asignaciones: [
            {
              idAsignacion: 1,
              idUsuario: 3,
              fechaAsignacion: new Date('2026-01-01T00:00:00.000Z'),
              usuario: { idUsuario: 3, nombre: 'Ana', apellido: 'García', fotoUrl: null },
            },
          ],
          etiquetas: ETIQUETAS_VALIDADAS.map((etiqueta) => ({ etiqueta })),
        }),
      );
      prisma.usuario.findUnique.mockResolvedValue({ nombre: 'Carlos', apellido: 'Mendoza' });
      prisma.proyecto.findUnique.mockResolvedValue({ tituloProyecto: 'Portal de Empleo UVG' });
      const service = new TasksService(prisma, auth, relations, notifications);
      return { tx, prisma, auth, relations, notifications, service };
    }

    it('usa el hito y el rol de los recursos validados, no directamente los IDs del DTO', async () => {
      const { tx, service } = makeFullSetup();

      await service.create(5, 1, DTO_COMPLETO);

      const data = tx.tarea.create.mock.calls[0][0].data;
      expect(data.idHito).toBe(HITO_VALIDADO.idHito);
      expect(data.idRolProyecto).toBe(ROL_VALIDADO.idRolProyecto);
    });

    it('crea exactamente una asignación con el usuario validado', async () => {
      const { tx, service } = makeFullSetup();

      await service.create(5, 1, DTO_COMPLETO);

      expect(tx.asignacionTarea.create).toHaveBeenCalledTimes(1);
      expect(tx.asignacionTarea.create).toHaveBeenCalledWith({
        data: {
          idTarea: 100,
          idUsuario: 3,
          asignadoPor: 1,
          desasignadaEn: null,
        },
      });
    });

    it('asocia todas las etiquetas validadas en una sola operación createMany', async () => {
      const { tx, service } = makeFullSetup();

      await service.create(5, 1, DTO_COMPLETO);

      expect(tx.tareaEtiqueta.createMany).toHaveBeenCalledTimes(1);
      expect(tx.tareaEtiqueta.createMany).toHaveBeenCalledWith({
        data: [
          { idTarea: 100, idEtiqueta: 1 },
          { idTarea: 100, idEtiqueta: 2 },
        ],
      });
    });

    it('no usa skipDuplicates en la creación de asociaciones', async () => {
      const { tx, service } = makeFullSetup();

      await service.create(5, 1, DTO_COMPLETO);

      const arg = tx.tareaEtiqueta.createMany.mock.calls[0][0];
      expect(arg).not.toHaveProperty('skipDuplicates');
    });

    it('respeta el orden: autorización → relaciones → tarea → asignación → etiquetas → lectura final', async () => {
      const orden: string[] = [];
      const tx = makeTx();
      const prisma = makePrisma(tx);
      const auth = { assertCanCreateTask: vi.fn(async () => { orden.push('autorizacion'); }) } as any;
      const relations = {
        validateCreateTaskRelations: vi.fn(async () => {
          orden.push('relaciones');
          return { hito: HITO_VALIDADO, rolProyecto: ROL_VALIDADO, etiquetas: ETIQUETAS_VALIDADAS };
        }),
      } as any;
      tx.tarea.create.mockImplementation(async () => {
        orden.push('tarea');
        return { idTarea: 100 };
      });
      tx.asignacionTarea.create.mockImplementation(async () => {
        orden.push('asignacion');
      });
      tx.tareaEtiqueta.createMany.mockImplementation(async () => {
        orden.push('etiquetas');
      });
      tx.tarea.findFirst.mockImplementation(async () => {
        orden.push('lectura_final');
        return tareaRow();
      });
      const notifications = makeNotifications();
      const service = new TasksService(prisma, auth, relations, notifications);

      await service.create(5, 1, DTO_COMPLETO);

      expect(orden).toEqual([
        'autorizacion',
        'relaciones',
        'tarea',
        'asignacion',
        'etiquetas',
        'lectura_final',
      ]);
    });

    it('todos los pasos internos reciben el mismo objeto tx', async () => {
      const { tx, auth, relations, service } = makeFullSetup();

      await service.create(5, 1, DTO_COMPLETO);

      expect(auth.assertCanCreateTask).toHaveBeenCalledWith(5, 1, tx);
      expect(relations.validateCreateTaskRelations).toHaveBeenCalledWith(5, DTO_COMPLETO, tx);
    });

    it('la notificación ocurre después de resolver $transaction, no dentro de ella (Tarea 34: tarea con rol y asignado -> solo notifyRoleMembers)', async () => {
      const orden: string[] = [];
      const { tx, prisma, service, notifications } = makeFullSetup();
      const originalTransaction = prisma.$transaction.getMockImplementation()!;
      prisma.$transaction.mockImplementation(async (cb: any) => {
        const result = await originalTransaction(cb);
        orden.push('fin_transaction');
        return result;
      });
      // DTO_COMPLETO tiene idRolProyecto e idUsuarioAsignado a la vez: por
      // la prioridad de audiencia de la Tarea 34, el rol gana y la
      // notificación pasa por notifyRoleMembers, nunca por
      // notifyFromTemplate/_notifyAssignment.
      notifications.notifyRoleMembers.mockImplementation(async () => {
        orden.push('notificacion');
      });
      tx.tarea.findFirst.mockImplementation(async () => {
        orden.push('lectura_final');
        return tareaRow({
          idHito: 4,
          idRolProyecto: 6,
          hito: { idHito: 4, tituloHito: 'MVP' },
          rolProyecto: { idRolProyecto: 6, nombreRol: 'Fullstack' },
        });
      });

      await service.create(5, 1, DTO_COMPLETO);

      expect(orden).toEqual(['lectura_final', 'fin_transaction', 'notificacion']);
      expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
      expect(notifications.notifyRoleMembers).toHaveBeenCalledWith(
        5,
        6,
        1,
        expect.objectContaining({ tipoNotificacion: 'TAREA_ACTUALIZADA' }),
      );
    });
  });

  describe('rollback lógico: cualquier fallo interno revierte y no notifica', () => {
    it('autorización rechazada: create() se rechaza, no se crea nada, no se notifica', async () => {
      const tx = makeTx();
      const prisma = makePrisma(tx);
      const auth = { assertCanCreateTask: vi.fn().mockRejectedValue(new ForbiddenException('No eres el líder')) } as any;
      const relations = makeRelations();
      const notifications = makeNotifications();
      const service = new TasksService(prisma, auth, relations, notifications);

      await expect(service.create(5, 1, BASE_DTO)).rejects.toBeInstanceOf(ForbiddenException);

      expect(relations.validateCreateTaskRelations).not.toHaveBeenCalled();
      expect(tx.tarea.create).not.toHaveBeenCalled();
      expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
    });

    it('validación de relaciones rechazada: no se crea la tarea, no se notifica', async () => {
      const tx = makeTx();
      const prisma = makePrisma(tx);
      const auth = makeAuthorization();
      const relations = {
        validateCreateTaskRelations: vi.fn().mockRejectedValue(new BadRequestException('Hito inválido')),
      } as any;
      const notifications = makeNotifications();
      const service = new TasksService(prisma, auth, relations, notifications);

      await expect(service.create(5, 1, BASE_DTO)).rejects.toBeInstanceOf(BadRequestException);

      expect(tx.tarea.create).not.toHaveBeenCalled();
      expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
    });

    it('fallo al crear la tarea: no se crea asignación ni etiquetas, no se notifica', async () => {
      const tx = makeTx();
      const prisma = makePrisma(tx);
      const relations = makeRelations({ etiquetas: [] });
      const notifications = makeNotifications();
      tx.tarea.create.mockRejectedValue(new Error('fallo de escritura'));
      const service = new TasksService(prisma, makeAuthorization(), relations, notifications);

      await expect(
        service.create(5, 1, { ...BASE_DTO, idUsuarioAsignado: 3 }),
      ).rejects.toThrow('fallo de escritura');

      expect(tx.asignacionTarea.create).not.toHaveBeenCalled();
      expect(tx.tareaEtiqueta.createMany).not.toHaveBeenCalled();
      expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
    });

    it('fallo al crear la asignación: no se crean etiquetas ni se llega a la lectura final, no se notifica', async () => {
      const tx = makeTx();
      const prisma = makePrisma(tx);
      const relations = makeRelations({
        etiquetas: [{ idEtiqueta: 1, idProyecto: 5, nombreEtiqueta: 'x', nombreNormalizado: 'x', color: '#000000' }],
      });
      const notifications = makeNotifications();
      tx.tarea.create.mockResolvedValue({ idTarea: 100 });
      tx.asignacionTarea.create.mockRejectedValue(new Error('fallo de asignación'));
      const service = new TasksService(prisma, makeAuthorization(), relations, notifications);

      await expect(
        service.create(5, 1, { ...BASE_DTO, idUsuarioAsignado: 3, idsEtiquetas: [1] }),
      ).rejects.toThrow('fallo de asignación');

      expect(tx.tareaEtiqueta.createMany).not.toHaveBeenCalled();
      expect(tx.tarea.findFirst).not.toHaveBeenCalled();
      expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
    });

    it('fallo al crear las etiquetas: no se llega a la lectura final, no se notifica', async () => {
      const tx = makeTx();
      const prisma = makePrisma(tx);
      const relations = makeRelations({
        etiquetas: [{ idEtiqueta: 1, idProyecto: 5, nombreEtiqueta: 'x', nombreNormalizado: 'x', color: '#000000' }],
      });
      const notifications = makeNotifications();
      tx.tarea.create.mockResolvedValue({ idTarea: 100 });
      tx.tareaEtiqueta.createMany.mockRejectedValue(new Error('fallo de etiquetas'));
      const service = new TasksService(prisma, makeAuthorization(), relations, notifications);

      await expect(
        service.create(5, 1, { ...BASE_DTO, idsEtiquetas: [1] }),
      ).rejects.toThrow('fallo de etiquetas');

      expect(tx.tarea.findFirst).not.toHaveBeenCalled();
      expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
    });

    it('la lectura final no encuentra la tarea: lanza y no se notifica', async () => {
      const tx = makeTx();
      const prisma = makePrisma(tx);
      const relations = makeRelations();
      const notifications = makeNotifications();
      tx.tarea.create.mockResolvedValue({ idTarea: 100 });
      tx.tarea.findFirst.mockResolvedValue(null);
      const service = new TasksService(prisma, makeAuthorization(), relations, notifications);

      await expect(service.create(5, 1, BASE_DTO)).rejects.toThrow();

      expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
    });

    it('ninguna escritura del rollback usa el PrismaService principal, solo tx', async () => {
      const tx = makeTx();
      const prisma = makePrisma(tx);
      tx.tarea.create.mockRejectedValue(new Error('fallo'));
      const service = new TasksService(prisma, makeAuthorization(), makeRelations(), makeNotifications());

      await expect(service.create(5, 1, BASE_DTO)).rejects.toThrow('fallo');

      // Las únicas escrituras de creación deben ser sobre tx.*, nunca prisma.tarea/asignacionTarea/tareaEtiqueta directamente.
      expect(prisma.tarea).toBeUndefined();
      expect(prisma.asignacionTarea).toBeUndefined();
      expect(prisma.tareaEtiqueta).toBeUndefined();
    });
  });

  describe('notificaciones', () => {
    it('con asignación: notifyFromTemplate se llama exactamente una vez, con el destinatario validado', async () => {
      const tx = makeTx();
      const prisma = makePrisma(tx);
      const relations = makeRelations();
      const notifications = makeNotifications();
      tx.tarea.create.mockResolvedValue({ idTarea: 100 });
      tx.tarea.findFirst.mockResolvedValue(tareaRow());
      prisma.usuario.findUnique.mockResolvedValue({ nombre: 'Carlos', apellido: 'Mendoza' });
      prisma.proyecto.findUnique.mockResolvedValue({ tituloProyecto: 'Portal de Empleo UVG' });
      const service = new TasksService(prisma, makeAuthorization(), relations, notifications);

      await service.create(5, 1, { ...BASE_DTO, idUsuarioAsignado: 3 });

      expect(notifications.notifyFromTemplate).toHaveBeenCalledTimes(1);
      expect(notifications.notifyFromTemplate).toHaveBeenCalledWith(
        [3],
        'TAREA_ASIGNADA',
        expect.objectContaining({
          taskTitle: 'Nueva tarea',
          projectTitle: 'Portal de Empleo UVG',
          assignedBy: 'Carlos Mendoza',
          taskId: 100,
          projectId: 5,
        }),
      );
    });

    it('sin asignación: notifyFromTemplate nunca se llama', async () => {
      const tx = makeTx();
      const prisma = makePrisma(tx);
      const notifications = makeNotifications();
      tx.tarea.create.mockResolvedValue({ idTarea: 100 });
      tx.tarea.findFirst.mockResolvedValue(tareaRow());
      const service = new TasksService(prisma, makeAuthorization(), makeRelations(), notifications);

      await service.create(5, 1, BASE_DTO);

      expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
    });

    it('un error al notificar no falla la creación: create() resuelve con la tarea', async () => {
      const tx = makeTx();
      const prisma = makePrisma(tx);
      const notifications = { notifyFromTemplate: vi.fn().mockRejectedValue(new Error('gateway caído')) } as any;
      tx.tarea.create.mockResolvedValue({ idTarea: 100 });
      tx.tarea.findFirst.mockResolvedValue(tareaRow());
      const service = new TasksService(prisma, makeAuthorization(), makeRelations(), notifications);

      const result = await service.create(5, 1, { ...BASE_DTO, idUsuarioAsignado: 3 });

      expect(result.idTarea).toBe(100);
    });

    it('el error de notificación se registra vía Logger y no se relanza', async () => {
      const tx = makeTx();
      const prisma = makePrisma(tx);
      const notifications = { notifyFromTemplate: vi.fn().mockRejectedValue(new Error('gateway caído')) } as any;
      tx.tarea.create.mockResolvedValue({ idTarea: 100 });
      tx.tarea.findFirst.mockResolvedValue(tareaRow());
      const service = new TasksService(prisma, makeAuthorization(), makeRelations(), notifications);
      const loggerSpy = vi.spyOn((service as any).logger, 'error').mockImplementation(() => undefined);

      await expect(
        service.create(5, 1, { ...BASE_DTO, idUsuarioAsignado: 3 }),
      ).resolves.toBeDefined();

      expect(loggerSpy).toHaveBeenCalledTimes(1);
    });

    it('cuando la transacción falla, la notificación nunca se intenta', async () => {
      const tx = makeTx();
      const prisma = makePrisma(tx);
      const notifications = makeNotifications();
      tx.tarea.create.mockRejectedValue(new Error('fallo de escritura'));
      const service = new TasksService(prisma, makeAuthorization(), makeRelations(), notifications);

      await expect(
        service.create(5, 1, { ...BASE_DTO, idUsuarioAsignado: 3 }),
      ).rejects.toThrow();

      expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
    });
  });

  describe('fecha límite', () => {
    it('2026-12-25 se envía a Prisma como Date UTC estable y vuelve como 2026-12-25', async () => {
      const tx = makeTx();
      const prisma = makePrisma(tx);
      tx.tarea.create.mockResolvedValue({ idTarea: 100 });
      tx.tarea.findFirst.mockResolvedValue(
        tareaRow({ fechaLimite: new Date('2026-12-25T00:00:00.000Z') }),
      );
      const service = new TasksService(prisma, makeAuthorization(), makeRelations(), makeNotifications());

      const result = await service.create(5, 1, { ...BASE_DTO, fechaLimite: '2026-12-25' });

      const fechaEnviada: Date = tx.tarea.create.mock.calls[0][0].data.fechaLimite;
      expect(fechaEnviada.toISOString()).toBe('2026-12-25T00:00:00.000Z');
      expect(result.fechaLimite).toBe('2026-12-25');
      expect(result.fechaLimite).not.toBe('2026-12-24');
    });
  });

  describe('contrato de respuesta', () => {
    it('no expone eliminadoEn, _count, asignaciones, estructura intermedia de etiquetas ni datos sensibles del usuario', async () => {
      const tx = makeTx();
      const prisma = makePrisma(tx);
      const relations = makeRelations({
        etiquetas: [{ idEtiqueta: 1, idProyecto: 5, nombreEtiqueta: 'x', nombreNormalizado: 'x', color: '#000000' }],
      });
      tx.tarea.create.mockResolvedValue({ idTarea: 100 });
      tx.tarea.findFirst.mockResolvedValue(
        tareaRow({
          asignaciones: [
            {
              idAsignacion: 1,
              idUsuario: 3,
              fechaAsignacion: new Date('2026-01-01T00:00:00.000Z'),
              usuario: { idUsuario: 3, nombre: 'Ana', apellido: 'García', fotoUrl: null },
            },
          ],
          etiquetas: [
            { etiqueta: { idEtiqueta: 1, nombreEtiqueta: 'x', nombreNormalizado: 'x', color: '#000000' } },
          ],
        }),
      );
      const service = new TasksService(prisma, makeAuthorization(), relations, makeNotifications());

      const result = await service.create(5, 1, { ...BASE_DTO, idUsuarioAsignado: 3, idsEtiquetas: [1] });

      expect(result).not.toHaveProperty('eliminadoEn');
      expect(result).not.toHaveProperty('_count');
      expect(result).not.toHaveProperty('asignaciones');
      expect(result).not.toHaveProperty('comentarios');
      expect(result.etiquetas[0]).not.toHaveProperty('idTarea');
      expect(Object.keys(result.asignacionActiva!.usuario).sort()).toEqual(
        ['apellido', 'fotoUrl', 'idUsuario', 'nombre'].sort(),
      );
      const serialized = JSON.stringify(result);
      expect(serialized).not.toMatch(/contrasena|password|hash|token|correo/i);
    });

    it('la respuesta de creación tiene la misma forma pública que listado/detalle', async () => {
      const tx = makeTx();
      const prisma = makePrisma(tx);
      tx.tarea.create.mockResolvedValue({ idTarea: 100 });
      tx.tarea.findFirst.mockResolvedValue(tareaRow());
      const service = new TasksService(prisma, makeAuthorization(), makeRelations(), makeNotifications());

      const result = await service.create(5, 1, BASE_DTO);

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
    });
  });

  describe('A12.1 — sincronización de Hito.estadoHito al crear una tarea', () => {
    function setupCreacionConHito(idHito: number) {
      const tx = makeTx();
      tx.hito = { update: vi.fn() };
      const prisma = makePrisma(tx);
      const auth = makeAuthorization();
      const relations = makeRelations({ hito: { idHito, idProyecto: 5, tituloHito: 'H' } });
      const notifications = makeNotifications();
      tx.tarea.create.mockResolvedValue({ idTarea: 100 });
      tx.tarea.findFirst.mockResolvedValue(tareaRow({ idHito }));
      const service = new TasksService(prisma, auth, relations, notifications);
      return { tx, service };
    }

    it('Hito previamente COMPLETADO + nueva tarea POR_HACER: persiste EN_PROGRESO (1 de 2 HECHO = 50%)', async () => {
      const { tx, service } = setupCreacionConHito(4);
      // Estado del Hito ANTES de esta creación: 1 tarea, HECHO (100%,
      // COMPLETADO). La consulta project-wide ya ve la tarea recién creada
      // (POR_HACER) junto con la existente (HECHO) — el nuevo estado de la
      // tarea ya participa en el cálculo.
      tx.tarea.findMany.mockResolvedValue([
        { idHito: 4, estadoTarea: 'HECHO' },
        { idHito: 4, estadoTarea: 'POR_HACER' },
      ]);

      await service.create(5, 1, { ...BASE_DTO, idHito: 4 });

      expect(tx.hito.update).toHaveBeenCalledWith({
        where: { idHito: 4 },
        data: { estadoHito: 'EN_PROGRESO' },
      });
      expect(tx.tarea.findMany).toHaveBeenCalledWith({
        where: { idHito: 4, eliminadoEn: null },
        select: { estadoTarea: true },
      });
    });

    it('Hito PENDIENTE recibe su primera tarea POR_HACER: permanece PENDIENTE (sin estado artificial)', async () => {
      const { tx, service } = setupCreacionConHito(5);
      tx.tarea.findMany.mockResolvedValue([{ idHito: 5, estadoTarea: 'POR_HACER' }]);

      await service.create(5, 1, { ...BASE_DTO, idHito: 5 });

      expect(tx.hito.update).toHaveBeenCalledWith({
        where: { idHito: 5 },
        data: { estadoHito: 'PENDIENTE' },
      });
    });

    it('crear tarea SIN Hito: no intenta sincronizar ningún Hito', async () => {
      const tx = makeTx();
      // tx.hito permanece undefined: si el código intentara sincronizar,
      // esta prueba fallaría con TypeError antes de completarse.
      const prisma = makePrisma(tx);
      const auth = makeAuthorization();
      const relations = makeRelations();
      const notifications = makeNotifications();
      tx.tarea.create.mockResolvedValue({ idTarea: 100 });
      tx.tarea.findFirst.mockResolvedValue(tareaRow({ idHito: null }));
      const service = new TasksService(prisma, auth, relations, notifications);

      await service.create(5, 1, BASE_DTO);

      expect(tx.tarea.findMany).not.toHaveBeenCalled();
    });
  });
});
