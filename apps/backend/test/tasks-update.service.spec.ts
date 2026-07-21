import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TasksService } from '../src/tasks/tasks.service';

function makeTx() {
  return {
    tarea: { update: vi.fn(), findFirst: vi.fn() },
    tareaEtiqueta: { deleteMany: vi.fn(), createMany: vi.fn() },
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
    assertCanEditTask: vi.fn().mockResolvedValue({ idTarea: 42, idProyecto: 5 }),
    ...overrides,
  } as any;
}

function makeRelations(overrides: Record<string, unknown> = {}) {
  return {
    validateRelatedResources: vi.fn().mockResolvedValue({
      hito: undefined,
      rolProyecto: undefined,
      etiquetas: undefined,
    }),
    assertUserAssignableToProject: vi.fn().mockResolvedValue(undefined),
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

describe('TasksService.update', () => {
  describe('payload vacío', () => {
    it('{} lanza BadRequestException y no abre una transacción', async () => {
      const { prisma, service } = makeService();

      await expect(service.update(5, 42, 1, {} as any)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('un objeto con solo claves no declaradas en UpdateTaskDto también se rechaza como vacío', async () => {
      const { prisma, service } = makeService();

      await expect(
        service.update(5, 42, 1, { algoDesconocido: 1 } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('campos escalares', () => {
    it('actualiza solo tituloTarea; los demás campos no aparecen en data', async () => {
      const { tx, service } = makeService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow({ tituloTarea: 'Nuevo título' }));

      await service.update(5, 42, 1, { tituloTarea: 'Nuevo título' } as any);

      expect(tx.tarea.update).toHaveBeenCalledWith({
        where: { idTarea: 42 },
        data: { tituloTarea: 'Nuevo título' },
      });
    });

    it('descripcionTarea enviada como cadena vacía se conserva como \'\', no se omite', async () => {
      const { tx, service } = makeService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow({ descripcionTarea: '' }));

      await service.update(5, 42, 1, { descripcionTarea: '' } as any);

      expect(tx.tarea.update).toHaveBeenCalledWith({
        where: { idTarea: 42 },
        data: { descripcionTarea: '' },
      });
    });

    it('actualiza prioridad de forma independiente', async () => {
      const { tx, service } = makeService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow({ prioridad: 'ALTA' }));

      await service.update(5, 42, 1, { prioridad: 'ALTA' } as any);

      expect(tx.tarea.update).toHaveBeenCalledWith({
        where: { idTarea: 42 },
        data: { prioridad: 'ALTA' },
      });
    });

    it('actualiza tiempoEstimadoHoras de forma independiente', async () => {
      const { tx, service } = makeService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow({ tiempoEstimadoHoras: 12 }));

      await service.update(5, 42, 1, { tiempoEstimadoHoras: 12 } as any);

      expect(tx.tarea.update).toHaveBeenCalledWith({
        where: { idTarea: 42 },
        data: { tiempoEstimadoHoras: 12 },
      });
    });

    it('varios campos escalares enviados juntos producen exactamente esas claves en data', async () => {
      const { tx, service } = makeService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      await service.update(5, 42, 1, {
        tituloTarea: 'T',
        prioridad: 'BAJA',
        tiempoEstimadoHoras: 3,
      } as any);

      const data = tx.tarea.update.mock.calls[0][0].data;
      expect(Object.keys(data).sort()).toEqual(['prioridad', 'tiempoEstimadoHoras', 'tituloTarea'].sort());
    });
  });

  describe('fecha límite', () => {
    it('2027-04-15 se envía a Prisma como 2027-04-15T00:00:00.000Z y vuelve como 2027-04-15', async () => {
      const { tx, service } = makeService();
      tx.tarea.findFirst.mockResolvedValue(
        tareaRow({ fechaLimite: new Date('2027-04-15T00:00:00.000Z') }),
      );

      const result = await service.update(5, 42, 1, { fechaLimite: '2027-04-15' } as any);

      const fechaEnviada: Date = tx.tarea.update.mock.calls[0][0].data.fechaLimite;
      expect(fechaEnviada.toISOString()).toBe('2027-04-15T00:00:00.000Z');
      expect(result.fechaLimite).toBe('2027-04-15');
    });

    it('fechaLimite omitida no aparece en data', async () => {
      const { tx, service } = makeService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      await service.update(5, 42, 1, { tituloTarea: 'T' } as any);

      expect(tx.tarea.update.mock.calls[0][0].data).not.toHaveProperty('fechaLimite');
    });
  });

  describe('hito', () => {
    it('idHito omitido: no se incluye idHito en la entrada de relaciones ni en data', async () => {
      const { tx, relations, service } = makeService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      await service.update(5, 42, 1, { tituloTarea: 'T' } as any);

      expect(relations.validateRelatedResources.mock.calls[0][1]).not.toHaveProperty('idHito');
      expect(tx.tarea.update.mock.calls[0][0].data).not.toHaveProperty('idHito');
    });

    it('idHito: null retira la relación', async () => {
      const { tx, relations, service } = makeService({
        relations: makeRelations({
          validateRelatedResources: vi.fn().mockResolvedValue({
            hito: null,
            rolProyecto: undefined,
            etiquetas: undefined,
          }),
        }),
      });
      tx.tarea.findFirst.mockResolvedValue(tareaRow({ idHito: null }));

      await service.update(5, 42, 1, { idHito: null } as any);

      expect(relations.validateRelatedResources).toHaveBeenCalledWith(5, { idHito: null }, tx);
      expect(tx.tarea.update.mock.calls[0][0].data.idHito).toBeNull();
    });

    it('idHito válido: usa el hito devuelto por la validación, no el ID crudo del DTO', async () => {
      const HITO_VALIDADO = { idHito: 4, idProyecto: 5, tituloHito: 'MVP' };
      const { tx, service } = makeService({
        relations: makeRelations({
          validateRelatedResources: vi.fn().mockResolvedValue({
            hito: HITO_VALIDADO,
            rolProyecto: undefined,
            etiquetas: undefined,
          }),
        }),
      });
      tx.tarea.findFirst.mockResolvedValue(tareaRow({ idHito: 4 }));

      await service.update(5, 42, 1, { idHito: 4 } as any);

      expect(tx.tarea.update.mock.calls[0][0].data.idHito).toBe(4);
    });

    it('hito de otro proyecto o inexistente: la excepción de las relaciones propaga y no llega a tarea.update', async () => {
      const { tx, service } = makeService({
        relations: makeRelations({
          validateRelatedResources: vi.fn().mockRejectedValue(
            new NotFoundException('Hito con id 4 no encontrado'),
          ),
        }),
      });

      await expect(service.update(5, 42, 1, { idHito: 4 } as any)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(tx.tarea.update).not.toHaveBeenCalled();
    });
  });

  describe('rol de proyecto', () => {
    it('idRolProyecto omitido: no se incluye en la entrada de relaciones ni en data, y no consulta asignación activa', async () => {
      const { tx, relations, context, service } = makeService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      await service.update(5, 42, 1, { tituloTarea: 'T' } as any);

      expect(relations.validateRelatedResources.mock.calls[0][1]).not.toHaveProperty(
        'idRolProyecto',
      );
      expect(tx.tarea.update.mock.calls[0][0].data).not.toHaveProperty('idRolProyecto');
      expect(context.getActiveAssignment).not.toHaveBeenCalled();
    });

    it('idRolProyecto: null retira la relación', async () => {
      const { tx, relations, service } = makeService({
        relations: makeRelations({
          validateRelatedResources: vi.fn().mockResolvedValue({
            hito: undefined,
            rolProyecto: null,
            etiquetas: undefined,
          }),
        }),
      });
      tx.tarea.findFirst.mockResolvedValue(tareaRow({ idRolProyecto: null }));

      await service.update(5, 42, 1, { idRolProyecto: null } as any);

      expect(relations.validateRelatedResources).toHaveBeenCalledWith(
        5,
        { idRolProyecto: null },
        tx,
      );
      expect(tx.tarea.update.mock.calls[0][0].data.idRolProyecto).toBeNull();
    });

    it('idRolProyecto válido: usa el rol devuelto por la validación', async () => {
      const ROL_VALIDADO = { idRolProyecto: 6, idProyecto: 5, nombreRol: 'Fullstack' };
      const { tx, service } = makeService({
        relations: makeRelations({
          validateRelatedResources: vi.fn().mockResolvedValue({
            hito: undefined,
            rolProyecto: ROL_VALIDADO,
            etiquetas: undefined,
          }),
        }),
      });
      tx.tarea.findFirst.mockResolvedValue(tareaRow({ idRolProyecto: 6 }));

      await service.update(5, 42, 1, { idRolProyecto: 6 } as any);

      expect(tx.tarea.update.mock.calls[0][0].data.idRolProyecto).toBe(6);
    });

    it('rol de otro proyecto o inexistente: la excepción de las relaciones propaga y no llega a tarea.update', async () => {
      const { tx, service } = makeService({
        relations: makeRelations({
          validateRelatedResources: vi.fn().mockRejectedValue(
            new BadRequestException('El rol con id 6 pertenece a otro proyecto'),
          ),
        }),
      });

      await expect(service.update(5, 42, 1, { idRolProyecto: 6 } as any)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(tx.tarea.update).not.toHaveBeenCalled();
    });
  });

  describe('etiquetas', () => {
    it('idsEtiquetas omitido: no llama deleteMany ni createMany, ni las incluye en la entrada de relaciones', async () => {
      const { tx, relations, service } = makeService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      await service.update(5, 42, 1, { tituloTarea: 'T' } as any);

      expect(relations.validateRelatedResources.mock.calls[0][1]).not.toHaveProperty(
        'idsEtiquetas',
      );
      expect(tx.tareaEtiqueta.deleteMany).not.toHaveBeenCalled();
      expect(tx.tareaEtiqueta.createMany).not.toHaveBeenCalled();
    });

    it('idsEtiquetas: [] elimina todas las asociaciones pero no crea nuevas', async () => {
      const { tx, relations, service } = makeService({
        relations: makeRelations({
          validateRelatedResources: vi.fn().mockResolvedValue({
            hito: undefined,
            rolProyecto: undefined,
            etiquetas: [],
          }),
        }),
      });
      tx.tarea.findFirst.mockResolvedValue(tareaRow({ etiquetas: [] }));

      await service.update(5, 42, 1, { idsEtiquetas: [] } as any);

      expect(relations.validateRelatedResources).toHaveBeenCalledWith(5, { idsEtiquetas: [] }, tx);
      expect(tx.tareaEtiqueta.deleteMany).toHaveBeenCalledWith({ where: { idTarea: 42 } });
      expect(tx.tareaEtiqueta.createMany).not.toHaveBeenCalled();
    });

    it('idsEtiquetas con valores: elimina las anteriores y crea el conjunto validado completo en una sola llamada', async () => {
      const ETIQUETAS_VALIDADAS = [
        { idEtiqueta: 1, idProyecto: 5, nombreEtiqueta: 'backend', nombreNormalizado: 'backend', color: '#10B981' },
        { idEtiqueta: 2, idProyecto: 5, nombreEtiqueta: 'urgente', nombreNormalizado: 'urgente', color: '#EF4444' },
      ];
      const { tx, service } = makeService({
        relations: makeRelations({
          validateRelatedResources: vi.fn().mockResolvedValue({
            hito: undefined,
            rolProyecto: undefined,
            etiquetas: ETIQUETAS_VALIDADAS,
          }),
        }),
      });
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      await service.update(5, 42, 1, { idsEtiquetas: [1, 2] } as any);

      expect(tx.tareaEtiqueta.deleteMany).toHaveBeenCalledWith({ where: { idTarea: 42 } });
      expect(tx.tareaEtiqueta.createMany).toHaveBeenCalledWith({
        data: [
          { idTarea: 42, idEtiqueta: 1 },
          { idTarea: 42, idEtiqueta: 2 },
        ],
      });
      const arg = tx.tareaEtiqueta.createMany.mock.calls[0][0];
      expect(arg).not.toHaveProperty('skipDuplicates');
    });

    it('los IDs usados en createMany provienen de los recursos validados, no directamente del DTO', async () => {
      const ETIQUETA_VALIDADA = [
        { idEtiqueta: 9, idProyecto: 5, nombreEtiqueta: 'x', nombreNormalizado: 'x', color: '#000000' },
      ];
      const { tx, service } = makeService({
        relations: makeRelations({
          validateRelatedResources: vi.fn().mockResolvedValue({
            hito: undefined,
            rolProyecto: undefined,
            etiquetas: ETIQUETA_VALIDADA,
          }),
        }),
      });
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      await service.update(5, 42, 1, { idsEtiquetas: [9] } as any);

      expect(tx.tareaEtiqueta.createMany).toHaveBeenCalledWith({
        data: [{ idTarea: 42, idEtiqueta: 9 }],
      });
    });

    it('fallo al crear las nuevas etiquetas revierte también la eliminación previa (rollback de la transacción completa)', async () => {
      const ETIQUETA_VALIDADA = [
        { idEtiqueta: 1, idProyecto: 5, nombreEtiqueta: 'x', nombreNormalizado: 'x', color: '#000000' },
      ];
      const { tx, prisma, service } = makeService({
        relations: makeRelations({
          validateRelatedResources: vi.fn().mockResolvedValue({
            hito: undefined,
            rolProyecto: undefined,
            etiquetas: ETIQUETA_VALIDADA,
          }),
        }),
      });
      tx.tareaEtiqueta.createMany.mockRejectedValue(new Error('fallo al crear etiquetas'));

      await expect(
        service.update(5, 42, 1, { idsEtiquetas: [1] } as any),
      ).rejects.toThrow('fallo al crear etiquetas');

      expect(tx.tareaEtiqueta.deleteMany).toHaveBeenCalledTimes(1);
      expect(tx.tarea.findFirst).not.toHaveBeenCalled();
      // El único mecanismo de reversión es el rechazo del callback de $transaction.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('compatibilidad del asignado activo al cambiar el rol', () => {
    it('editar un campo sin tocar idRolProyecto no consulta la asignación activa', async () => {
      const { context, service, tx } = makeService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      await service.update(5, 42, 1, { tituloTarea: 'T' } as any);

      expect(context.getActiveAssignment).not.toHaveBeenCalled();
    });

    it('cambio de rol sin asignación activa: permitido, no valida compatibilidad', async () => {
      const { context, relations, service, tx } = makeService({
        relations: makeRelations({
          validateRelatedResources: vi.fn().mockResolvedValue({
            hito: undefined,
            rolProyecto: { idRolProyecto: 6, idProyecto: 5, nombreRol: 'Fullstack' },
            etiquetas: undefined,
          }),
        }),
        context: makeContext({ getActiveAssignment: vi.fn().mockResolvedValue(null) }),
      });
      tx.tarea.findFirst.mockResolvedValue(tareaRow({ idRolProyecto: 6 }));

      await service.update(5, 42, 1, { idRolProyecto: 6 } as any);

      expect(context.getActiveAssignment).toHaveBeenCalledWith(42, tx);
      expect(relations.assertUserAssignableToProject).not.toHaveBeenCalled();
      expect(tx.tarea.update).toHaveBeenCalled();
    });

    it('cambio de rol con asignado compatible: permitido, valida contra el rol nuevo exacto', async () => {
      const ROL_VALIDADO = { idRolProyecto: 6, idProyecto: 5, nombreRol: 'Fullstack' };
      const { relations, service, tx } = makeService({
        relations: makeRelations({
          validateRelatedResources: vi.fn().mockResolvedValue({
            hito: undefined,
            rolProyecto: ROL_VALIDADO,
            etiquetas: undefined,
          }),
        }),
        context: makeContext({
          getActiveAssignment: vi.fn().mockResolvedValue({ idAsignacion: 1, idUsuario: 3, idTarea: 42 }),
        }),
      });
      tx.tarea.findFirst.mockResolvedValue(tareaRow({ idRolProyecto: 6 }));

      await service.update(5, 42, 1, { idRolProyecto: 6 } as any);

      expect(relations.assertUserAssignableToProject).toHaveBeenCalledWith(5, 3, 6, tx);
      expect(tx.tarea.update).toHaveBeenCalled();
    });

    it('cambio de rol con asignado incompatible: rechaza antes de modificar la tarea', async () => {
      const ROL_VALIDADO = { idRolProyecto: 6, idProyecto: 5, nombreRol: 'Fullstack' };
      const { service, tx } = makeService({
        relations: makeRelations({
          validateRelatedResources: vi.fn().mockResolvedValue({
            hito: undefined,
            rolProyecto: ROL_VALIDADO,
            etiquetas: undefined,
          }),
          assertUserAssignableToProject: vi
            .fn()
            .mockRejectedValue(new BadRequestException('El usuario no tiene una participación activa en el rol de la tarea')),
        }),
        context: makeContext({
          getActiveAssignment: vi.fn().mockResolvedValue({ idAsignacion: 1, idUsuario: 3, idTarea: 42 }),
        }),
      });

      await expect(service.update(5, 42, 1, { idRolProyecto: 6 } as any)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(tx.tarea.update).not.toHaveBeenCalled();
    });

    it('retiro de rol (idRolProyecto: null) con asignado que participa activamente en el proyecto: permitido, rol efectivo null', async () => {
      const { relations, service, tx } = makeService({
        relations: makeRelations({
          validateRelatedResources: vi.fn().mockResolvedValue({
            hito: undefined,
            rolProyecto: null,
            etiquetas: undefined,
          }),
        }),
        context: makeContext({
          getActiveAssignment: vi.fn().mockResolvedValue({ idAsignacion: 1, idUsuario: 3, idTarea: 42 }),
        }),
      });
      tx.tarea.findFirst.mockResolvedValue(tareaRow({ idRolProyecto: null }));

      await service.update(5, 42, 1, { idRolProyecto: null } as any);

      expect(relations.assertUserAssignableToProject).toHaveBeenCalledWith(5, 3, null, tx);
      expect(tx.tarea.update).toHaveBeenCalled();
    });

    it('retiro de rol con asignado externo al proyecto: rechazado', async () => {
      const { service, tx } = makeService({
        relations: makeRelations({
          validateRelatedResources: vi.fn().mockResolvedValue({
            hito: undefined,
            rolProyecto: null,
            etiquetas: undefined,
          }),
          assertUserAssignableToProject: vi
            .fn()
            .mockRejectedValue(new BadRequestException('El usuario no tiene una participación activa en el proyecto')),
        }),
        context: makeContext({
          getActiveAssignment: vi.fn().mockResolvedValue({ idAsignacion: 1, idUsuario: 3, idTarea: 42 }),
        }),
      });

      await expect(service.update(5, 42, 1, { idRolProyecto: null } as any)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(tx.tarea.update).not.toHaveBeenCalled();
    });

    it('nunca escribe en AsignacionTarea: no expone create/update/delete/updateMany en el tx usado', async () => {
      const { service, tx } = makeService({
        relations: makeRelations({
          validateRelatedResources: vi.fn().mockResolvedValue({
            hito: undefined,
            rolProyecto: { idRolProyecto: 6, idProyecto: 5, nombreRol: 'Fullstack' },
            etiquetas: undefined,
          }),
        }),
        context: makeContext({
          getActiveAssignment: vi.fn().mockResolvedValue({ idAsignacion: 1, idUsuario: 3, idTarea: 42 }),
        }),
      });
      tx.tarea.findFirst.mockResolvedValue(tareaRow({ idRolProyecto: 6 }));

      await service.update(5, 42, 1, { idRolProyecto: 6 } as any);

      expect((tx as any).asignacionTarea).toBeUndefined();
    });

    it('el rechazo por incompatibilidad tiene status 400 exacto, nunca 409/ConflictException', async () => {
      const { service } = makeService({
        relations: makeRelations({
          validateRelatedResources: vi.fn().mockResolvedValue({
            hito: undefined,
            rolProyecto: { idRolProyecto: 7, idProyecto: 5, nombreRol: 'QA' },
            etiquetas: undefined,
          }),
          assertUserAssignableToProject: vi
            .fn()
            .mockRejectedValue(
              new BadRequestException('El usuario no tiene una participación activa en el rol de la tarea'),
            ),
        }),
        context: makeContext({
          getActiveAssignment: vi.fn().mockResolvedValue({ idAsignacion: 1, idUsuario: 3, idTarea: 42 }),
        }),
      });

      try {
        await service.update(5, 42, 1, { idRolProyecto: 7 } as any);
        throw new Error('no debía resolver');
      } catch (e: any) {
        expect(e).toBeInstanceOf(BadRequestException);
        expect(e).not.toBeInstanceOf(ConflictException);
        expect(e.getStatus()).toBe(400);
        expect(e.getStatus()).not.toBe(409);
      }
    });

    it('payload combinado (título + rol + etiquetas) con asignado incompatible: no ejecuta tarea.update ni etiquetas', async () => {
      const { tx, service } = makeService({
        relations: makeRelations({
          validateRelatedResources: vi.fn().mockResolvedValue({
            hito: undefined,
            rolProyecto: { idRolProyecto: 7, idProyecto: 5, nombreRol: 'QA' },
            etiquetas: [
              { idEtiqueta: 2, idProyecto: 5, nombreEtiqueta: 'a', nombreNormalizado: 'a', color: '#111111' },
              { idEtiqueta: 3, idProyecto: 5, nombreEtiqueta: 'b', nombreNormalizado: 'b', color: '#222222' },
            ],
          }),
          assertUserAssignableToProject: vi
            .fn()
            .mockRejectedValue(new BadRequestException('incompatible')),
        }),
        context: makeContext({
          getActiveAssignment: vi.fn().mockResolvedValue({ idAsignacion: 1, idUsuario: 3, idTarea: 42 }),
        }),
      });

      await expect(
        service.update(5, 42, 1, {
          tituloTarea: 'Título que no debe persistir',
          idRolProyecto: 7,
          idsEtiquetas: [2, 3],
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(tx.tarea.update).not.toHaveBeenCalled();
      expect(tx.tareaEtiqueta.deleteMany).not.toHaveBeenCalled();
      expect(tx.tareaEtiqueta.createMany).not.toHaveBeenCalled();
      expect((tx as any).asignacionTarea).toBeUndefined();
    });
  });

  describe('orden transaccional', () => {
    it('respeta: autorización → relaciones → asignación activa/compatibilidad → tarea → etiquetas → lectura final', async () => {
      const orden: string[] = [];
      const tx = makeTx();
      const prisma = makePrisma(tx);
      const auth = {
        assertCanEditTask: vi.fn(async () => {
          orden.push('autorizacion');
          return { idTarea: 42, idProyecto: 5 };
        }),
      } as any;
      const relations = {
        validateRelatedResources: vi.fn(async () => {
          orden.push('relaciones');
          return {
            hito: undefined,
            rolProyecto: { idRolProyecto: 6, idProyecto: 5, nombreRol: 'Fullstack' },
            etiquetas: [{ idEtiqueta: 1, idProyecto: 5, nombreEtiqueta: 'x', nombreNormalizado: 'x', color: '#000' }],
          };
        }),
        assertUserAssignableToProject: vi.fn(async () => {
          orden.push('compatibilidad_asignado');
        }),
      } as any;
      const context = {
        getActiveAssignment: vi.fn(async () => {
          orden.push('asignacion_activa');
          return { idAsignacion: 1, idUsuario: 3, idTarea: 42 };
        }),
      } as any;
      tx.tarea.update.mockImplementation(async () => {
        orden.push('tarea_update');
      });
      tx.tareaEtiqueta.deleteMany.mockImplementation(async () => {
        orden.push('etiquetas_delete');
      });
      tx.tareaEtiqueta.createMany.mockImplementation(async () => {
        orden.push('etiquetas_create');
      });
      tx.tarea.findFirst.mockImplementation(async () => {
        orden.push('lectura_final');
        return tareaRow({ idRolProyecto: 6 });
      });
      const service = new TasksService(prisma, auth, relations, makeNotifications(), context);

      await service.update(5, 42, 1, { idRolProyecto: 6, idsEtiquetas: [1] } as any);

      expect(orden).toEqual([
        'autorizacion',
        'relaciones',
        'asignacion_activa',
        'compatibilidad_asignado',
        'tarea_update',
        'etiquetas_delete',
        'etiquetas_create',
        'lectura_final',
      ]);
    });

    it('todos los pasos internos reciben el mismo objeto tx', async () => {
      const { tx, auth, relations, context, service } = makeService({
        relations: makeRelations({
          validateRelatedResources: vi.fn().mockResolvedValue({
            hito: undefined,
            rolProyecto: { idRolProyecto: 6, idProyecto: 5, nombreRol: 'Fullstack' },
            etiquetas: undefined,
          }),
        }),
        context: makeContext({
          getActiveAssignment: vi.fn().mockResolvedValue({ idAsignacion: 1, idUsuario: 3, idTarea: 42 }),
        }),
      });
      tx.tarea.findFirst.mockResolvedValue(tareaRow({ idRolProyecto: 6 }));

      await service.update(5, 42, 1, { idRolProyecto: 6 } as any);

      expect(auth.assertCanEditTask).toHaveBeenCalledWith(5, 42, 1, tx);
      expect(relations.validateRelatedResources).toHaveBeenCalledWith(5, { idRolProyecto: 6 }, tx);
      expect(context.getActiveAssignment).toHaveBeenCalledWith(42, tx);
    });
  });

  describe('autorización', () => {
    it('tarea inexistente o de otro proyecto: propaga NotFoundException, no valida relaciones', async () => {
      const { relations, service } = makeService({
        auth: makeAuthorization({
          assertCanEditTask: vi
            .fn()
            .mockRejectedValue(new NotFoundException('Tarea con id 42 no encontrada en el proyecto 5')),
        }),
      });

      await expect(service.update(5, 42, 1, { tituloTarea: 'T' } as any)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(relations.validateRelatedResources).not.toHaveBeenCalled();
    });

    it('actor no líder: propaga ForbiddenException', async () => {
      const { service, tx } = makeService({
        auth: makeAuthorization({
          assertCanEditTask: vi.fn().mockRejectedValue(new ForbiddenException('No eres el líder de este proyecto')),
        }),
      });

      await expect(service.update(5, 42, 1, { tituloTarea: 'T' } as any)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(tx.tarea.update).not.toHaveBeenCalled();
    });
  });

  describe('rollback lógico', () => {
    it('fallo en autorización: no abre relaciones ni escrituras', async () => {
      const { tx, relations, notifications, service } = makeService({
        auth: makeAuthorization({
          assertCanEditTask: vi.fn().mockRejectedValue(new ForbiddenException('No eres el líder')),
        }),
      });

      await expect(service.update(5, 42, 1, { tituloTarea: 'T' } as any)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(relations.validateRelatedResources).not.toHaveBeenCalled();
      expect(tx.tarea.update).not.toHaveBeenCalled();
      expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
    });

    it('fallo en relaciones: no llega a tarea.update ni a etiquetas', async () => {
      const { tx, service } = makeService({
        relations: makeRelations({
          validateRelatedResources: vi.fn().mockRejectedValue(new BadRequestException('Hito inválido')),
        }),
      });

      await expect(service.update(5, 42, 1, { idHito: 4 } as any)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(tx.tarea.update).not.toHaveBeenCalled();
      expect(tx.tareaEtiqueta.deleteMany).not.toHaveBeenCalled();
    });

    it('fallo en compatibilidad del asignado: no llega a tarea.update ni a etiquetas', async () => {
      const { tx, service } = makeService({
        relations: makeRelations({
          validateRelatedResources: vi.fn().mockResolvedValue({
            hito: undefined,
            rolProyecto: { idRolProyecto: 6, idProyecto: 5, nombreRol: 'Fullstack' },
            etiquetas: undefined,
          }),
          assertUserAssignableToProject: vi.fn().mockRejectedValue(new BadRequestException('incompatible')),
        }),
        context: makeContext({
          getActiveAssignment: vi.fn().mockResolvedValue({ idAsignacion: 1, idUsuario: 3, idTarea: 42 }),
        }),
      });

      await expect(service.update(5, 42, 1, { idRolProyecto: 6 } as any)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(tx.tarea.update).not.toHaveBeenCalled();
      expect(tx.tareaEtiqueta.deleteMany).not.toHaveBeenCalled();
    });

    it('fallo en tarea.update: no llega a etiquetas ni a la lectura final', async () => {
      const { tx, service } = makeService({
        relations: makeRelations({
          validateRelatedResources: vi.fn().mockResolvedValue({
            hito: undefined,
            rolProyecto: undefined,
            etiquetas: [{ idEtiqueta: 1, idProyecto: 5, nombreEtiqueta: 'x', nombreNormalizado: 'x', color: '#000' }],
          }),
        }),
      });
      tx.tarea.update.mockRejectedValue(new Error('fallo de escritura'));

      await expect(
        service.update(5, 42, 1, { tituloTarea: 'T', idsEtiquetas: [1] } as any),
      ).rejects.toThrow('fallo de escritura');
      expect(tx.tareaEtiqueta.deleteMany).not.toHaveBeenCalled();
      expect(tx.tarea.findFirst).not.toHaveBeenCalled();
    });

    it('fallo en la eliminación de etiquetas: no llega a la creación ni a la lectura final', async () => {
      const { tx, service } = makeService({
        relations: makeRelations({
          validateRelatedResources: vi.fn().mockResolvedValue({
            hito: undefined,
            rolProyecto: undefined,
            etiquetas: [{ idEtiqueta: 1, idProyecto: 5, nombreEtiqueta: 'x', nombreNormalizado: 'x', color: '#000' }],
          }),
        }),
      });
      tx.tareaEtiqueta.deleteMany.mockRejectedValue(new Error('fallo al eliminar etiquetas'));

      await expect(
        service.update(5, 42, 1, { idsEtiquetas: [1] } as any),
      ).rejects.toThrow('fallo al eliminar etiquetas');
      expect(tx.tareaEtiqueta.createMany).not.toHaveBeenCalled();
      expect(tx.tarea.findFirst).not.toHaveBeenCalled();
    });

    it('la lectura final no encuentra la tarea: lanza dentro de la transacción', async () => {
      const { tx, service } = makeService();
      tx.tarea.findFirst.mockResolvedValue(null);

      await expect(service.update(5, 42, 1, { tituloTarea: 'T' } as any)).rejects.toThrow();
    });

    it('ninguna escritura del update usa PrismaService fuera de tx', async () => {
      const { prisma, service } = makeService();
      (prisma as any).tx.tarea.update.mockRejectedValue(new Error('fallo'));

      await expect(service.update(5, 42, 1, { tituloTarea: 'T' } as any)).rejects.toThrow('fallo');

      expect(prisma.tarea).toBeUndefined();
      expect(prisma.tareaEtiqueta).toBeUndefined();
      expect(prisma.asignacionTarea).toBeUndefined();
    });
  });

  describe('notificaciones', () => {
    it('nunca llama a notifyFromTemplate', async () => {
      const { tx, notifications, service } = makeService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      await service.update(5, 42, 1, { tituloTarea: 'T' } as any);

      expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
    });
  });

  describe('contrato de respuesta', () => {
    it('coincide con la forma pública de creación/listado/detalle', async () => {
      const { tx, service } = makeService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      const result = await service.update(5, 42, 1, { tituloTarea: 'T' } as any);

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

    it('no expone eliminadoEn ni _count', async () => {
      const { tx, service } = makeService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      const result = await service.update(5, 42, 1, { tituloTarea: 'T' } as any);

      expect(result).not.toHaveProperty('eliminadoEn');
      expect(result).not.toHaveProperty('_count');
    });

    it('la lectura final usa TASK_SELECT con idProyecto y eliminadoEn: null', async () => {
      const { tx, service } = makeService();
      tx.tarea.findFirst.mockResolvedValue(tareaRow());

      await service.update(5, 42, 1, { tituloTarea: 'T' } as any);

      expect(tx.tarea.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { idTarea: 42, idProyecto: 5, eliminadoEn: null },
        }),
      );
    });
  });
});
