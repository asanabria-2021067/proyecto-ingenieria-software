import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TasksService } from '../src/tasks/tasks.service';

function makeTx() {
  return {
    tarea: { findFirst: vi.fn() },
    asignacionTarea: { create: vi.fn(), updateMany: vi.fn() },
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
    assertCanAssignTask: vi.fn().mockResolvedValue({ idTarea: 42, idProyecto: 5, idRolProyecto: null }),
    ...overrides,
  } as any;
}

function makeRelations(overrides: Record<string, unknown> = {}) {
  return {
    assertUserAssignableToProject: vi.fn().mockResolvedValue(undefined),
    validateRelatedResources: vi.fn(),
    ...overrides,
  } as any;
}

function makeContext(overrides: Record<string, unknown> = {}) {
  return {
    getActiveAssignment: vi.fn().mockResolvedValue(null),
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

function makeService(opts: {
  prisma?: any;
  auth?: any;
  relations?: any;
  notifications?: any;
  context?: any;
} = {}) {
  const tx = makeTx();
  const prisma = opts.prisma ?? makePrisma(tx);
  const auth = opts.auth ?? makeAuthorization();
  const relations = opts.relations ?? makeRelations();
  const notifications = opts.notifications ?? makeNotifications();
  const context = opts.context ?? makeContext();
  const service = new TasksService(prisma, auth, relations, notifications, context);
  return { tx: prisma.tx, prisma, auth, relations, notifications, context, service };
}

const DTO = { idUsuario: 7 } as any;

describe('TasksService.assign', () => {
  describe('autorización', () => {
    it('líder permitido: assertCanAssignTask resuelve y la operación procede', async () => {
      const { tx, auth, service } = makeService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      const result = await service.assign(5, 42, 1, DTO);

      expect(auth.assertCanAssignTask).toHaveBeenCalledWith(5, 42, 1, tx);
      expect(result.idTarea).toBe(42);
    });

    it('participante no líder rechazado: propaga ForbiddenException, no escribe', async () => {
      const { tx, service } = makeService({
        auth: makeAuthorization({
          assertCanAssignTask: vi.fn().mockRejectedValue(new ForbiddenException('No eres el líder de este proyecto')),
        }),
      });

      await expect(service.assign(5, 42, 7, DTO)).rejects.toBeInstanceOf(ForbiddenException);
      expect(tx.asignacionTarea.create).not.toHaveBeenCalled();
      expect(tx.asignacionTarea.updateMany).not.toHaveBeenCalled();
    });

    it('asignado activo no líder rechazado', async () => {
      const { tx, service } = makeService({
        auth: makeAuthorization({
          assertCanAssignTask: vi.fn().mockRejectedValue(new ForbiddenException('No eres el líder de este proyecto')),
        }),
      });

      await expect(service.assign(5, 42, 3, DTO)).rejects.toBeInstanceOf(ForbiddenException);
      expect(tx.asignacionTarea.create).not.toHaveBeenCalled();
    });

    it('creador de la tarea no líder rechazado', async () => {
      const { tx, service } = makeService({
        auth: makeAuthorization({
          assertCanAssignTask: vi.fn().mockRejectedValue(new ForbiddenException('No eres el líder de este proyecto')),
        }),
      });

      await expect(service.assign(5, 42, 1, DTO)).rejects.toBeInstanceOf(ForbiddenException);
      expect(tx.asignacionTarea.create).not.toHaveBeenCalled();
    });

    it('usuario externo rechazado', async () => {
      const { tx, service } = makeService({
        auth: makeAuthorization({
          assertCanAssignTask: vi.fn().mockRejectedValue(new ForbiddenException('externo')),
        }),
      });

      await expect(service.assign(5, 42, 999, DTO)).rejects.toBeInstanceOf(ForbiddenException);
      expect(tx.asignacionTarea.create).not.toHaveBeenCalled();
    });

    it('tarea inexistente: propaga NotFoundException', async () => {
      const { tx, service } = makeService({
        auth: makeAuthorization({
          assertCanAssignTask: vi
            .fn()
            .mockRejectedValue(new NotFoundException('Tarea con id 999 no encontrada en el proyecto 5')),
        }),
      });

      await expect(service.assign(5, 999, 1, DTO)).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.asignacionTarea.create).not.toHaveBeenCalled();
    });

    it('tarea eliminada: propaga NotFoundException', async () => {
      const { tx, service } = makeService({
        auth: makeAuthorization({
          assertCanAssignTask: vi
            .fn()
            .mockRejectedValue(new NotFoundException('Tarea con id 42 no encontrada en el proyecto 5')),
        }),
      });

      await expect(service.assign(5, 42, 1, DTO)).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.asignacionTarea.create).not.toHaveBeenCalled();
    });

    it('tarea de otro proyecto: propaga NotFoundException', async () => {
      const { tx, service } = makeService({
        auth: makeAuthorization({
          assertCanAssignTask: vi
            .fn()
            .mockRejectedValue(new NotFoundException('Tarea con id 42 no encontrada en el proyecto 1')),
        }),
      });

      await expect(service.assign(1, 42, 1, DTO)).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.asignacionTarea.create).not.toHaveBeenCalled();
    });

    it('proyecto eliminado: propaga NotFoundException', async () => {
      const { tx, service } = makeService({
        auth: makeAuthorization({
          assertCanAssignTask: vi.fn().mockRejectedValue(new NotFoundException('Proyecto con id 5 no encontrado')),
        }),
      });

      await expect(service.assign(5, 42, 1, DTO)).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.asignacionTarea.create).not.toHaveBeenCalled();
    });

    it('assertCanAssignTask recibe projectId, taskId, userId y el mismo tx', async () => {
      const { tx, auth, service } = makeService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      await service.assign(5, 42, 1, DTO);

      expect(auth.assertCanAssignTask).toHaveBeenCalledWith(5, 42, 1, tx);
    });
  });

  describe('validación del candidato', () => {
    it('el rol efectivo proviene de la tarea devuelta por autorización, no del DTO', async () => {
      const { tx, relations, service } = makeService({
        auth: makeAuthorization({
          assertCanAssignTask: vi.fn().mockResolvedValue({ idTarea: 42, idProyecto: 5, idRolProyecto: 6 }),
        }),
      });
      tx.tarea.findFirst.mockResolvedValue(tareaRow({ idRolProyecto: 6 }));

      await service.assign(5, 42, 1, DTO);

      expect(relations.assertUserAssignableToProject).toHaveBeenCalledWith(5, 7, 6, tx);
    });

    it('tarea sin rol: rolEfectivo es null', async () => {
      const { tx, relations, service } = makeService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      await service.assign(5, 42, 1, DTO);

      expect(relations.assertUserAssignableToProject).toHaveBeenCalledWith(5, 7, null, tx);
    });

    it('candidato activo en el rol exacto: permitido (tarea con rol)', async () => {
      const { tx, service } = makeService({
        auth: makeAuthorization({
          assertCanAssignTask: vi.fn().mockResolvedValue({ idTarea: 42, idProyecto: 5, idRolProyecto: 6 }),
        }),
      });
      tx.tarea.findFirst.mockResolvedValue(tareaRow({ idRolProyecto: 6 }));

      await expect(service.assign(5, 42, 1, DTO)).resolves.toBeDefined();
    });

    it('candidato activo en otro rol: 400, no escribe', async () => {
      const { tx, service } = makeService({
        auth: makeAuthorization({
          assertCanAssignTask: vi.fn().mockResolvedValue({ idTarea: 42, idProyecto: 5, idRolProyecto: 6 }),
        }),
        relations: makeRelations({
          assertUserAssignableToProject: vi
            .fn()
            .mockRejectedValue(new BadRequestException('El usuario no tiene una participación activa en el rol de la tarea')),
        }),
      });

      await expect(service.assign(5, 42, 1, DTO)).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.asignacionTarea.create).not.toHaveBeenCalled();
    });

    it('candidato inactivo: 400', async () => {
      const { tx, service } = makeService({
        relations: makeRelations({
          assertUserAssignableToProject: vi.fn().mockRejectedValue(new BadRequestException('inactivo')),
        }),
      });

      await expect(service.assign(5, 42, 1, DTO)).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.asignacionTarea.create).not.toHaveBeenCalled();
    });

    it('candidato activo solo en otro proyecto: 400', async () => {
      const { tx, service } = makeService({
        relations: makeRelations({
          assertUserAssignableToProject: vi
            .fn()
            .mockRejectedValue(new BadRequestException('El usuario no tiene una participación activa en el proyecto')),
        }),
      });

      await expect(service.assign(5, 42, 1, DTO)).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.asignacionTarea.create).not.toHaveBeenCalled();
    });

    it('usuario inexistente: 404', async () => {
      const { tx, service } = makeService({
        relations: makeRelations({
          assertUserAssignableToProject: vi
            .fn()
            .mockRejectedValue(new NotFoundException('Usuario con id 7 no encontrado')),
        }),
      });

      await expect(service.assign(5, 42, 1, DTO)).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.asignacionTarea.create).not.toHaveBeenCalled();
    });

    it('líder como candidato sin participación en el rol: 400 (el líder no está exento)', async () => {
      const { tx, service } = makeService({
        auth: makeAuthorization({
          assertCanAssignTask: vi.fn().mockResolvedValue({ idTarea: 42, idProyecto: 5, idRolProyecto: 6 }),
        }),
        relations: makeRelations({
          assertUserAssignableToProject: vi.fn().mockRejectedValue(new BadRequestException('sin participación')),
        }),
      });

      await expect(service.assign(5, 42, 1, { idUsuario: 1 } as any)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(tx.asignacionTarea.create).not.toHaveBeenCalled();
    });

    it('candidato activo en cualquier rol del proyecto: permitido (tarea sin rol)', async () => {
      const { tx, service } = makeService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      await expect(service.assign(5, 42, 1, DTO)).resolves.toBeDefined();
    });

    it('candidato sin participación activa (tarea sin rol): 400', async () => {
      const { tx, service } = makeService({
        relations: makeRelations({
          assertUserAssignableToProject: vi
            .fn()
            .mockRejectedValue(new BadRequestException('El usuario no tiene una participación activa en el proyecto')),
        }),
      });

      await expect(service.assign(5, 42, 1, DTO)).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.asignacionTarea.create).not.toHaveBeenCalled();
    });
  });

  describe('asignación inicial (sin asignación activa)', () => {
    it('asignacionActiva es null, se crea exactamente una fila con los datos correctos', async () => {
      const { tx, service } = makeService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      await service.assign(5, 42, 1, DTO);

      expect(tx.asignacionTarea.create).toHaveBeenCalledTimes(1);
      expect(tx.asignacionTarea.create).toHaveBeenCalledWith({
        data: { idTarea: 42, idUsuario: 7, idParticipacion: undefined, asignadoPor: 1, desasignadaEn: null },
      });
      expect(tx.asignacionTarea.updateMany).not.toHaveBeenCalled();
    });

    /**
     * X1.1: idParticipacion exacto ya resuelto por
     * assertUserAssignableToProject (misma consulta que ya valida al
     * candidato — sin segunda consulta) se persiste tal cual en la fila
     * activa. Necesario para que HoursRecognitionService (B10) pueda
     * encontrar este tramo como reconocible.
     */
    it('el idParticipacion resuelto por assertUserAssignableToProject se persiste en la fila creada', async () => {
      const relations = makeRelations({
        assertUserAssignableToProject: vi.fn().mockResolvedValue(55),
      });
      const { tx, service } = makeService({ relations });
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      await service.assign(5, 42, 1, DTO);

      expect(tx.asignacionTarea.create).toHaveBeenCalledWith({
        data: { idTarea: 42, idUsuario: 7, idParticipacion: 55, asignadoPor: 1, desasignadaEn: null },
      });
    });

    it('lectura final ocurre después, respuesta pública con el nuevo asignado', async () => {
      const { tx, service } = makeService();
      tx.tarea.findFirst.mockResolvedValue(
        tareaRow({
          asignaciones: [
            {
              idAsignacion: 1,
              idUsuario: 7,
              fechaAsignacion: new Date('2026-03-01T00:00:00.000Z'),
              usuario: { idUsuario: 7, nombre: 'Ana', apellido: 'García', fotoUrl: null },
            },
          ],
        }),
      );

      const result = await service.assign(5, 42, 1, DTO);

      expect(result.asignacionActiva?.idUsuario).toBe(7);
    });
  });

  describe('idempotencia (mismo usuario ya asignado)', () => {
    function makeIdempotenteService() {
      return makeService({
        context: makeContext({
          getActiveAssignment: vi.fn().mockResolvedValue({
            idAsignacion: 9,
            idTarea: 42,
            idUsuario: 7,
            asignadoPor: 1,
            fechaAsignacion: new Date('2026-01-05T00:00:00.000Z'),
            desasignadaEn: null,
          }),
        }),
      });
    }

    it('no llama create ni updateMany cuando el usuario ya es el asignado activo', async () => {
      const { tx, service } = makeIdempotenteService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      await service.assign(5, 42, 1, DTO);

      expect(tx.asignacionTarea.create).not.toHaveBeenCalled();
      expect(tx.asignacionTarea.updateMany).not.toHaveBeenCalled();
    });

    it('responde 200/éxito con la lectura final, sin alterar historial', async () => {
      const { tx, service } = makeIdempotenteService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      await expect(service.assign(5, 42, 1, DTO)).resolves.toBeDefined();
      expect(tx.tarea.findFirst).toHaveBeenCalledTimes(1);
    });

    it('dos llamadas consecutivas al mismo usuario no producen filas adicionales', async () => {
      const { tx, service } = makeIdempotenteService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      await service.assign(5, 42, 1, DTO);
      await service.assign(5, 42, 1, DTO);

      expect(tx.asignacionTarea.create).not.toHaveBeenCalled();
      expect(tx.asignacionTarea.updateMany).not.toHaveBeenCalled();
    });

    it('el candidato se revalida en cada llamada (assertUserAssignableToProject llamado cada vez)', async () => {
      const { relations, tx, service } = makeIdempotenteService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      await service.assign(5, 42, 1, DTO);
      await service.assign(5, 42, 1, DTO);

      expect(relations.assertUserAssignableToProject).toHaveBeenCalledTimes(2);
    });

    it('si el candidato pierde participación entre llamadas, la segunda devuelve 400 y no se trata como éxito idempotente', async () => {
      const { relations, tx, service } = makeIdempotenteService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow());
      relations.assertUserAssignableToProject
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new BadRequestException('perdió participación'));

      await expect(service.assign(5, 42, 1, DTO)).resolves.toBeDefined();
      await expect(service.assign(5, 42, 1, DTO)).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.asignacionTarea.create).not.toHaveBeenCalled();
      expect(tx.asignacionTarea.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('reasignación a otro usuario', () => {
    function makeReasignacionService() {
      return makeService({
        context: makeContext({
          getActiveAssignment: vi.fn().mockResolvedValue({
            idAsignacion: 9,
            idTarea: 42,
            idUsuario: 3, // usuario distinto del candidato (7)
            asignadoPor: 1,
            fechaAsignacion: new Date('2026-01-05T00:00:00.000Z'),
            desasignadaEn: null,
          }),
        }),
      });
    }

    it('primero cierra la asignación anterior, luego crea la nueva', async () => {
      const orden: string[] = [];
      const { tx, service } = makeReasignacionService();
      tx.asignacionTarea.updateMany.mockImplementation(async () => {
        orden.push('cerrar');
      });
      tx.asignacionTarea.create.mockImplementation(async () => {
        orden.push('crear');
      });
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      await service.assign(5, 42, 1, DTO);

      expect(orden).toEqual(['cerrar', 'crear']);
    });

    it('el filtro de cierre incluye idAsignacion, idTarea y desasignadaEn: null', async () => {
      const { tx, service } = makeReasignacionService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      await service.assign(5, 42, 1, DTO);

      expect(tx.asignacionTarea.updateMany).toHaveBeenCalledWith({
        where: { idAsignacion: 9, idTarea: 42, desasignadaEn: null },
        data: { desasignadaEn: expect.any(Date) },
      });
    });

    it('la fila anterior no cambia de idUsuario (el updateMany solo toca desasignadaEn)', async () => {
      const { tx, service } = makeReasignacionService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      await service.assign(5, 42, 1, DTO);

      const data = tx.asignacionTarea.updateMany.mock.calls[0][0].data;
      expect(Object.keys(data)).toEqual(['desasignadaEn']);
    });

    it('la nueva fila contiene el candidato, el actor y desasignadaEn: null', async () => {
      const { tx, service } = makeReasignacionService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      await service.assign(5, 42, 1, DTO);

      expect(tx.asignacionTarea.create).toHaveBeenCalledWith({
        data: { idTarea: 42, idUsuario: 7, idParticipacion: undefined, asignadoPor: 1, desasignadaEn: null },
      });
    });

    it('X1.1: reasignación persiste el idParticipacion exacto resuelto por assertUserAssignableToProject (camino compartido con la asignación inicial vía createActiveAssignment)', async () => {
      const relations = makeRelations({
        assertUserAssignableToProject: vi.fn().mockResolvedValue(88),
      });
      const { tx, service } = makeService({
        relations,
        context: makeContext({
          getActiveAssignment: vi.fn().mockResolvedValue({
            idAsignacion: 9,
            idTarea: 42,
            idUsuario: 3,
            asignadoPor: 1,
            fechaAsignacion: new Date('2026-01-05T00:00:00.000Z'),
            desasignadaEn: null,
          }),
        }),
      });
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      await service.assign(5, 42, 1, DTO);

      expect(tx.asignacionTarea.create).toHaveBeenCalledWith({
        data: { idTarea: 42, idUsuario: 7, idParticipacion: 88, asignadoPor: 1, desasignadaEn: null },
      });
    });

    it('lectura final devuelve al nuevo asignado', async () => {
      const { tx, service } = makeReasignacionService();
      tx.tarea.findFirst.mockResolvedValue(
        tareaRow({
          asignaciones: [
            {
              idAsignacion: 10,
              idUsuario: 7,
              fechaAsignacion: new Date('2026-04-01T00:00:00.000Z'),
              usuario: { idUsuario: 7, nombre: 'Ana', apellido: 'García', fotoUrl: null },
            },
          ],
        }),
      );

      const result = await service.assign(5, 42, 1, DTO);

      expect(result.asignacionActiva?.idUsuario).toBe(7);
    });

    it('nunca se llama delete/deleteMany sobre AsignacionTarea', async () => {
      const { tx, service } = makeReasignacionService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      await service.assign(5, 42, 1, DTO);

      expect((tx.asignacionTarea as any).delete).toBeUndefined();
      expect((tx.asignacionTarea as any).deleteMany).toBeUndefined();
    });
  });

  describe('orden transaccional', () => {
    it('respeta: autorización → validación del candidato → asignación activa → cierre → creación → lectura final', async () => {
      const orden: string[] = [];
      const tx = makeTx();
      const prisma = makePrisma(tx);
      const auth = {
        assertCanAssignTask: vi.fn(async () => {
          orden.push('autorizacion');
          return { idTarea: 42, idProyecto: 5, idRolProyecto: null };
        }),
      } as any;
      const relations = {
        assertUserAssignableToProject: vi.fn(async () => {
          orden.push('validacion_candidato');
        }),
      } as any;
      const context = {
        getActiveAssignment: vi.fn(async () => {
          orden.push('asignacion_activa');
          return { idAsignacion: 9, idTarea: 42, idUsuario: 3, asignadoPor: 1, fechaAsignacion: new Date(), desasignadaEn: null };
        }),
      } as any;
      tx.asignacionTarea.updateMany.mockImplementation(async () => {
        orden.push('cierre');
      });
      tx.asignacionTarea.create.mockImplementation(async () => {
        orden.push('creacion');
      });
      tx.tarea.findFirst.mockImplementation(async () => {
        orden.push('lectura_final');
        return tareaRow();
      });
      const notifications = makeNotifications();
      const service = new TasksService(prisma, auth, relations, notifications, context);

      await service.assign(5, 42, 1, DTO);

      expect(orden).toEqual([
        'autorizacion',
        'validacion_candidato',
        'asignacion_activa',
        'cierre',
        'creacion',
        'lectura_final',
      ]);
    });

    it('todos los pasos reciben el mismo tx', async () => {
      const { tx, auth, relations, context, service } = makeService({
        context: makeContext({
          getActiveAssignment: vi.fn().mockResolvedValue({
            idAsignacion: 9,
            idTarea: 42,
            idUsuario: 3,
            asignadoPor: 1,
            fechaAsignacion: new Date(),
            desasignadaEn: null,
          }),
        }),
      });
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      await service.assign(5, 42, 1, DTO);

      expect(auth.assertCanAssignTask).toHaveBeenCalledWith(5, 42, 1, tx);
      expect(relations.assertUserAssignableToProject).toHaveBeenCalledWith(5, 7, null, tx);
      expect(context.getActiveAssignment).toHaveBeenCalledWith(42, tx);
    });
  });

  describe('fallos y rollback', () => {
    it('autorización fallida: no valida candidato ni escribe', async () => {
      const { tx, relations, notifications, service } = makeService({
        auth: makeAuthorization({
          assertCanAssignTask: vi.fn().mockRejectedValue(new ForbiddenException('no autorizado')),
        }),
      });

      await expect(service.assign(5, 42, 1, DTO)).rejects.toBeInstanceOf(ForbiddenException);

      expect(relations.assertUserAssignableToProject).not.toHaveBeenCalled();
      expect(tx.asignacionTarea.create).not.toHaveBeenCalled();
      expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
    });

    it('candidato inválido: no consulta asignación activa ni escribe', async () => {
      const { tx, context, service } = makeService({
        relations: makeRelations({
          assertUserAssignableToProject: vi.fn().mockRejectedValue(new BadRequestException('inválido')),
        }),
      });

      await expect(service.assign(5, 42, 1, DTO)).rejects.toBeInstanceOf(BadRequestException);

      expect(context.getActiveAssignment).not.toHaveBeenCalled();
      expect(tx.asignacionTarea.create).not.toHaveBeenCalled();
    });

    it('fallo al consultar la asignación activa: no escribe', async () => {
      const { tx, service } = makeService({
        context: makeContext({ getActiveAssignment: vi.fn().mockRejectedValue(new Error('fallo consulta')) }),
      });

      await expect(service.assign(5, 42, 1, DTO)).rejects.toThrow('fallo consulta');

      expect(tx.asignacionTarea.create).not.toHaveBeenCalled();
      expect(tx.asignacionTarea.updateMany).not.toHaveBeenCalled();
    });

    it('fallo al cerrar la anterior: no se crea la nueva ni se lee la tarea final', async () => {
      const { tx, service } = makeService({
        context: makeContext({
          getActiveAssignment: vi.fn().mockResolvedValue({
            idAsignacion: 9,
            idTarea: 42,
            idUsuario: 3,
            asignadoPor: 1,
            fechaAsignacion: new Date(),
            desasignadaEn: null,
          }),
        }),
      });
      tx.asignacionTarea.updateMany.mockRejectedValue(new Error('fallo al cerrar'));

      await expect(service.assign(5, 42, 1, DTO)).rejects.toThrow('fallo al cerrar');

      expect(tx.asignacionTarea.create).not.toHaveBeenCalled();
      expect(tx.tarea.findFirst).not.toHaveBeenCalled();
    });

    it('fallo al crear la nueva asignación (reasignación): no se llega a la lectura final', async () => {
      const { tx, service } = makeService({
        context: makeContext({
          getActiveAssignment: vi.fn().mockResolvedValue({
            idAsignacion: 9,
            idTarea: 42,
            idUsuario: 3,
            asignadoPor: 1,
            fechaAsignacion: new Date(),
            desasignadaEn: null,
          }),
        }),
      });
      tx.asignacionTarea.create.mockRejectedValue(new Error('fallo al crear'));

      await expect(service.assign(5, 42, 1, DTO)).rejects.toThrow('fallo al crear');

      expect(tx.tarea.findFirst).not.toHaveBeenCalled();
    });

    it('fallo al crear la asignación inicial (sin asignación previa): no se llega a la lectura final', async () => {
      const { tx, service } = makeService();
      tx.asignacionTarea.create.mockRejectedValue(new Error('fallo al crear inicial'));

      await expect(service.assign(5, 42, 1, DTO)).rejects.toThrow('fallo al crear inicial');

      expect(tx.tarea.findFirst).not.toHaveBeenCalled();
    });

    it('lectura final nula: lanza dentro de la transacción', async () => {
      const { tx, service } = makeService();
      tx.tarea.findFirst.mockResolvedValue(null);

      await expect(service.assign(5, 42, 1, DTO)).rejects.toThrow();
    });

    it('lectura final con error: se propaga, no se notifica', async () => {
      const { tx, notifications, service } = makeService();
      tx.tarea.findFirst.mockRejectedValue(new Error('fallo de lectura'));

      await expect(service.assign(5, 42, 1, DTO)).rejects.toThrow('fallo de lectura');

      expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
    });

    it('ninguna escritura usa PrismaService fuera de tx', async () => {
      const { prisma, tx, service } = makeService();
      tx.asignacionTarea.create.mockRejectedValue(new Error('fallo'));

      await expect(service.assign(5, 42, 1, DTO)).rejects.toThrow('fallo');

      expect(prisma.tarea).toBeUndefined();
      expect(prisma.asignacionTarea).toBeUndefined();
    });

    it('nunca se notifica en ningún camino (asignación inicial, idempotente o reasignación)', async () => {
      const { tx, notifications, service } = makeService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      await service.assign(5, 42, 1, DTO);

      expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
    });

    it('no ejecuta eliminación física alguna (ausencia de delete/deleteMany)', async () => {
      const { tx, service } = makeService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      await service.assign(5, 42, 1, DTO);

      expect((tx as any).comentario).toBeUndefined();
      expect((tx as any).evidencia).toBeUndefined();
      expect((tx.asignacionTarea as any).delete).toBeUndefined();
      expect((tx.asignacionTarea as any).deleteMany).toBeUndefined();
    });
  });

  describe('contrato de respuesta', () => {
    it('coincide con la forma pública de creación/listado/detalle/edición/estado', async () => {
      const { tx, service } = makeService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      const result = await service.assign(5, 42, 1, DTO);

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
    });

    it('la lectura final usa idTarea + idProyecto + eliminadoEn: null', async () => {
      const { tx, service } = makeService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      await service.assign(5, 42, 1, DTO);

      expect(tx.tarea.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { idTarea: 42, idProyecto: 5, eliminadoEn: null } }),
      );
    });
  });
});
