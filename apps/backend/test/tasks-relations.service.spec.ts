import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { TasksContextService } from '../src/tasks/tasks-context.service';
import { TasksRelationsService } from '../src/tasks/tasks-relations.service';

function makePrisma() {
  return {
    usuario: { findUnique: vi.fn() },
    participacionProyecto: { findFirst: vi.fn() },
    // Espías de escritura: si TasksRelationsService alguna vez los invocara,
    // las pruebas de "ausencia de escrituras" lo detectarían explícitamente.
    tarea: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    asignacionTarea: { create: vi.fn() },
    tareaEtiqueta: { create: vi.fn() },
    $transaction: vi.fn(),
  };
}

function makeContext() {
  return {
    getMilestoneInProjectOrThrow: vi.fn(),
    getRoleInProjectOrThrow: vi.fn(),
    getLabelsInProjectOrThrow: vi.fn(),
  };
}

const HITO = { idHito: 4, idProyecto: 5, tituloHito: 'MVP funcional' };
const ROL = { idRolProyecto: 6, idProyecto: 5, nombreRol: 'Fullstack' };
const ETIQUETAS = [
  { idEtiqueta: 1, idProyecto: 5, nombreEtiqueta: 'backend', nombreNormalizado: 'backend', color: '#10B981' },
  { idEtiqueta: 2, idProyecto: 5, nombreEtiqueta: 'urgente', nombreNormalizado: 'urgente', color: '#EF4444' },
];

describe('TasksRelationsService', () => {
  describe('validateRelatedResources', () => {
    it('todos los campos omitidos: devuelve undefined en los tres y no consulta nada', async () => {
      const prisma = makePrisma();
      const context = makeContext();
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      const result = await service.validateRelatedResources(5, {});

      expect(result).toEqual({ hito: undefined, rolProyecto: undefined, etiquetas: undefined });
      expect(context.getMilestoneInProjectOrThrow).not.toHaveBeenCalled();
      expect(context.getRoleInProjectOrThrow).not.toHaveBeenCalled();
      expect(context.getLabelsInProjectOrThrow).not.toHaveBeenCalled();
    });

    it('idHito: null devuelve hito: null sin consultar', async () => {
      const prisma = makePrisma();
      const context = makeContext();
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      const result = await service.validateRelatedResources(5, { idHito: null });

      expect(result.hito).toBeNull();
      expect(context.getMilestoneInProjectOrThrow).not.toHaveBeenCalled();
    });

    it('idRolProyecto: null devuelve rolProyecto: null sin consultar', async () => {
      const prisma = makePrisma();
      const context = makeContext();
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      const result = await service.validateRelatedResources(5, { idRolProyecto: null });

      expect(result.rolProyecto).toBeNull();
      expect(context.getRoleInProjectOrThrow).not.toHaveBeenCalled();
    });

    it('idsEtiquetas: [] delega en getLabelsInProjectOrThrow, que ya evita la consulta para un arreglo vacío', async () => {
      const prisma = makePrisma();
      const context = makeContext();
      context.getLabelsInProjectOrThrow.mockResolvedValue([]);
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      const result = await service.validateRelatedResources(5, { idsEtiquetas: [] });

      expect(result.etiquetas).toEqual([]);
      expect(context.getLabelsInProjectOrThrow).toHaveBeenCalledWith(5, [], undefined);
    });

    it('hito válido delega en getMilestoneInProjectOrThrow y devuelve el registro', async () => {
      const prisma = makePrisma();
      const context = makeContext();
      context.getMilestoneInProjectOrThrow.mockResolvedValue(HITO);
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      const result = await service.validateRelatedResources(5, { idHito: 4 });

      expect(result.hito).toBe(HITO);
      expect(context.getMilestoneInProjectOrThrow).toHaveBeenCalledWith(5, 4, undefined);
    });

    it('rol válido delega en getRoleInProjectOrThrow y devuelve el registro', async () => {
      const prisma = makePrisma();
      const context = makeContext();
      context.getRoleInProjectOrThrow.mockResolvedValue(ROL);
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      const result = await service.validateRelatedResources(5, { idRolProyecto: 6 });

      expect(result.rolProyecto).toBe(ROL);
      expect(context.getRoleInProjectOrThrow).toHaveBeenCalledWith(5, 6, undefined);
    });

    it('etiquetas válidas delega en getLabelsInProjectOrThrow y devuelve el resultado', async () => {
      const prisma = makePrisma();
      const context = makeContext();
      context.getLabelsInProjectOrThrow.mockResolvedValue(ETIQUETAS);
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      const result = await service.validateRelatedResources(5, { idsEtiquetas: [1, 2] });

      expect(result.etiquetas).toBe(ETIQUETAS);
      expect(context.getLabelsInProjectOrThrow).toHaveBeenCalledWith(5, [1, 2], undefined);
    });

    it('hito inexistente propaga NotFoundException', async () => {
      const prisma = makePrisma();
      const context = makeContext();
      context.getMilestoneInProjectOrThrow.mockRejectedValue(
        new NotFoundException('Hito con id 999 no encontrado'),
      );
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      await expect(service.validateRelatedResources(5, { idHito: 999 })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('hito de otro proyecto propaga BadRequestException', async () => {
      const prisma = makePrisma();
      const context = makeContext();
      context.getMilestoneInProjectOrThrow.mockRejectedValue(
        new BadRequestException('El hito con id 4 pertenece a otro proyecto'),
      );
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      await expect(service.validateRelatedResources(5, { idHito: 4 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rol inexistente propaga NotFoundException', async () => {
      const prisma = makePrisma();
      const context = makeContext();
      context.getRoleInProjectOrThrow.mockRejectedValue(
        new NotFoundException('Rol de proyecto con id 999 no encontrado'),
      );
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      await expect(
        service.validateRelatedResources(5, { idRolProyecto: 999 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rol de otro proyecto propaga BadRequestException', async () => {
      const prisma = makePrisma();
      const context = makeContext();
      context.getRoleInProjectOrThrow.mockRejectedValue(
        new BadRequestException('El rol con id 6 pertenece a otro proyecto'),
      );
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      await expect(
        service.validateRelatedResources(5, { idRolProyecto: 6 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('etiqueta inexistente propaga NotFoundException', async () => {
      const prisma = makePrisma();
      const context = makeContext();
      context.getLabelsInProjectOrThrow.mockRejectedValue(
        new NotFoundException('Etiqueta(s) con id 999 no encontrada(s)'),
      );
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      await expect(
        service.validateRelatedResources(5, { idsEtiquetas: [999] }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('etiqueta de otro proyecto propaga BadRequestException', async () => {
      const prisma = makePrisma();
      const context = makeContext();
      context.getLabelsInProjectOrThrow.mockRejectedValue(
        new BadRequestException('Etiqueta(s) con id 2 pertenece(n) a otro proyecto'),
      );
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      await expect(
        service.validateRelatedResources(5, { idsEtiquetas: [2] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('IDs de etiquetas duplicados propaga BadRequestException', async () => {
      const prisma = makePrisma();
      const context = makeContext();
      context.getLabelsInProjectOrThrow.mockRejectedValue(
        new BadRequestException('idsEtiquetas contiene valores duplicados'),
      );
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      await expect(
        service.validateRelatedResources(5, { idsEtiquetas: [1, 1] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('conserva el orden de etiquetas devuelto por getLabelsInProjectOrThrow', async () => {
      const prisma = makePrisma();
      const context = makeContext();
      const ordenadas = [ETIQUETAS[1], ETIQUETAS[0]];
      context.getLabelsInProjectOrThrow.mockResolvedValue(ordenadas);
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      const result = await service.validateRelatedResources(5, { idsEtiquetas: [2, 1] });

      expect(result.etiquetas).toBe(ordenadas);
    });

    it('traslada el mismo tx a las tres llamadas de TasksContextService', async () => {
      const prisma = makePrisma();
      const context = makeContext();
      context.getMilestoneInProjectOrThrow.mockResolvedValue(HITO);
      context.getRoleInProjectOrThrow.mockResolvedValue(ROL);
      context.getLabelsInProjectOrThrow.mockResolvedValue(ETIQUETAS);
      const tx = { marker: 'tx' } as unknown as Prisma.TransactionClient;
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      await service.validateRelatedResources(
        5,
        { idHito: 4, idRolProyecto: 6, idsEtiquetas: [1, 2] },
        tx,
      );

      expect(context.getMilestoneInProjectOrThrow).toHaveBeenCalledWith(5, 4, tx);
      expect(context.getRoleInProjectOrThrow).toHaveBeenCalledWith(5, 6, tx);
      expect(context.getLabelsInProjectOrThrow).toHaveBeenCalledWith(5, [1, 2], tx);
    });

    it('valida en orden hito, rol, etiquetas', async () => {
      const prisma = makePrisma();
      const context = makeContext();
      const orden: string[] = [];
      context.getMilestoneInProjectOrThrow.mockImplementation(async () => {
        orden.push('hito');
        return HITO;
      });
      context.getRoleInProjectOrThrow.mockImplementation(async () => {
        orden.push('rol');
        return ROL;
      });
      context.getLabelsInProjectOrThrow.mockImplementation(async () => {
        orden.push('etiquetas');
        return ETIQUETAS;
      });
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      await service.validateRelatedResources(5, { idHito: 4, idRolProyecto: 6, idsEtiquetas: [1, 2] });

      expect(orden).toEqual(['hito', 'rol', 'etiquetas']);
    });
  });

  describe('assertUserAssignableToProject — con rol', () => {
    it('permite a un usuario existente con participación activa en el rol exacto', async () => {
      const prisma = makePrisma();
      const context = makeContext();
      prisma.usuario.findUnique.mockResolvedValue({ idUsuario: 3 });
      context.getRoleInProjectOrThrow.mockResolvedValue(ROL);
      prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 1 });
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      // X1.1: retorna el idParticipacion exacto ya resuelto por la
      // consulta, para que el caller (TasksService) pueda persistirlo en
      // AsignacionTarea.idParticipacion sin una segunda consulta.
      await expect(service.assertUserAssignableToProject(5, 3, 6)).resolves.toBe(1);
    });

    it('rechaza con NotFoundException si el usuario no existe, sin validar el rol', async () => {
      const prisma = makePrisma();
      const context = makeContext();
      prisma.usuario.findUnique.mockResolvedValue(null);
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      await expect(service.assertUserAssignableToProject(5, 999, 6)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(context.getRoleInProjectOrThrow).not.toHaveBeenCalled();
    });

    it('rechaza con BadRequestException si el usuario tiene participación activa en OTRO rol', async () => {
      const prisma = makePrisma();
      const context = makeContext();
      prisma.usuario.findUnique.mockResolvedValue({ idUsuario: 3 });
      context.getRoleInProjectOrThrow.mockResolvedValue(ROL);
      // El filtro idRolProyecto: 6 no coincide con la participación real (rol 9).
      prisma.participacionProyecto.findFirst.mockResolvedValue(null);
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      await expect(service.assertUserAssignableToProject(5, 3, 6)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rechaza con BadRequestException si la participación en el rol correcto no está ACTIVO', async () => {
      const prisma = makePrisma();
      const context = makeContext();
      prisma.usuario.findUnique.mockResolvedValue({ idUsuario: 3 });
      context.getRoleInProjectOrThrow.mockResolvedValue(ROL);
      prisma.participacionProyecto.findFirst.mockResolvedValue(null);
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      await expect(service.assertUserAssignableToProject(5, 3, 6)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rechaza con BadRequestException una participación activa en el mismo rol lógico de otro proyecto', async () => {
      const prisma = makePrisma();
      const context = makeContext();
      prisma.usuario.findUnique.mockResolvedValue({ idUsuario: 3 });
      context.getRoleInProjectOrThrow.mockResolvedValue(ROL);
      prisma.participacionProyecto.findFirst.mockResolvedValue(null);
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      await expect(service.assertUserAssignableToProject(5, 3, 6)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('el líder del proyecto sin participación es rechazado (no hay excepción por liderazgo)', async () => {
      // assertUserAssignableToProject nunca consulta Proyecto.creadoPor: la
      // única fuente de verdad es ParticipacionProyecto.
      const prisma = makePrisma();
      const context = makeContext();
      prisma.usuario.findUnique.mockResolvedValue({ idUsuario: 100 });
      context.getRoleInProjectOrThrow.mockResolvedValue(ROL);
      prisma.participacionProyecto.findFirst.mockResolvedValue(null);
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      await expect(service.assertUserAssignableToProject(5, 100, 6)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('el creador de la tarea (creadaPor) sin participación es rechazado, sin excepción por autoría', async () => {
      // Este servicio nunca recibe ni consulta Tarea.creadaPor.
      const prisma = makePrisma();
      const context = makeContext();
      prisma.usuario.findUnique.mockResolvedValue({ idUsuario: 777 });
      context.getRoleInProjectOrThrow.mockResolvedValue(ROL);
      prisma.participacionProyecto.findFirst.mockResolvedValue(null);
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      await expect(service.assertUserAssignableToProject(5, 777, 6)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rol inexistente propaga NotFoundException sin consultar participación', async () => {
      const prisma = makePrisma();
      const context = makeContext();
      prisma.usuario.findUnique.mockResolvedValue({ idUsuario: 3 });
      context.getRoleInProjectOrThrow.mockRejectedValue(
        new NotFoundException('Rol de proyecto con id 999 no encontrado'),
      );
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      await expect(service.assertUserAssignableToProject(5, 3, 999)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.participacionProyecto.findFirst).not.toHaveBeenCalled();
    });

    it('rol de otro proyecto propaga BadRequestException sin consultar participación', async () => {
      const prisma = makePrisma();
      const context = makeContext();
      prisma.usuario.findUnique.mockResolvedValue({ idUsuario: 3 });
      context.getRoleInProjectOrThrow.mockRejectedValue(
        new BadRequestException('El rol con id 6 pertenece a otro proyecto'),
      );
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      await expect(service.assertUserAssignableToProject(5, 3, 6)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.participacionProyecto.findFirst).not.toHaveBeenCalled();
    });

    it('filtro exacto: idUsuario + idRolProyecto + estadoParticipacion ACTIVO + rolProyecto.idProyecto', async () => {
      const prisma = makePrisma();
      const context = makeContext();
      prisma.usuario.findUnique.mockResolvedValue({ idUsuario: 3 });
      context.getRoleInProjectOrThrow.mockResolvedValue(ROL);
      prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 1 });
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      await service.assertUserAssignableToProject(5, 3, 6);

      expect(prisma.participacionProyecto.findFirst).toHaveBeenCalledWith({
        where: {
          idUsuario: 3,
          idRolProyecto: 6,
          estadoParticipacion: 'ACTIVO',
          rolProyecto: { idProyecto: 5 },
        },
        select: { idParticipacion: true },
      });
    });

    it('usa el cliente transaccional en usuario.findUnique, el contexto y participacionProyecto.findFirst', async () => {
      const prisma = makePrisma();
      const tx = makePrisma();
      const context = makeContext();
      tx.usuario.findUnique.mockResolvedValue({ idUsuario: 3 });
      context.getRoleInProjectOrThrow.mockResolvedValue(ROL);
      tx.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 1 });
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      await service.assertUserAssignableToProject(5, 3, 6, tx as unknown as Prisma.TransactionClient);

      expect(tx.usuario.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.usuario.findUnique).not.toHaveBeenCalled();
      expect(context.getRoleInProjectOrThrow).toHaveBeenCalledWith(5, 6, tx);
      expect(tx.participacionProyecto.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.participacionProyecto.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('assertUserAssignableToProject — sin rol', () => {
    it('permite con participación activa en cualquier rol del proyecto', async () => {
      const prisma = makePrisma();
      const context = makeContext();
      prisma.usuario.findUnique.mockResolvedValue({ idUsuario: 3 });
      prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 1 });
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      await expect(service.assertUserAssignableToProject(5, 3, null)).resolves.toBe(1);
      expect(context.getRoleInProjectOrThrow).not.toHaveBeenCalled();
    });

    it('usuario inexistente produce NotFoundException', async () => {
      const prisma = makePrisma();
      const context = makeContext();
      prisma.usuario.findUnique.mockResolvedValue(null);
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      await expect(service.assertUserAssignableToProject(5, 999, null)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('sin ninguna participación produce BadRequestException', async () => {
      const prisma = makePrisma();
      const context = makeContext();
      prisma.usuario.findUnique.mockResolvedValue({ idUsuario: 3 });
      prisma.participacionProyecto.findFirst.mockResolvedValue(null);
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      await expect(service.assertUserAssignableToProject(5, 3, null)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('participación inactiva produce BadRequestException', async () => {
      const prisma = makePrisma();
      const context = makeContext();
      prisma.usuario.findUnique.mockResolvedValue({ idUsuario: 3 });
      prisma.participacionProyecto.findFirst.mockResolvedValue(null);
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      await expect(service.assertUserAssignableToProject(5, 3, null)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('participación activa únicamente en otro proyecto produce BadRequestException', async () => {
      const prisma = makePrisma();
      const context = makeContext();
      prisma.usuario.findUnique.mockResolvedValue({ idUsuario: 3 });
      // El filtro rolProyecto.idProyecto: 5 excluye una participación real en el proyecto 9.
      prisma.participacionProyecto.findFirst.mockResolvedValue(null);
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      await expect(service.assertUserAssignableToProject(5, 3, null)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('el líder del proyecto sin participación es rechazado', async () => {
      const prisma = makePrisma();
      const context = makeContext();
      prisma.usuario.findUnique.mockResolvedValue({ idUsuario: 100 });
      prisma.participacionProyecto.findFirst.mockResolvedValue(null);
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      await expect(service.assertUserAssignableToProject(5, 100, null)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('filtro sin idRolProyecto: solo idUsuario + estadoParticipacion ACTIVO + rolProyecto.idProyecto', async () => {
      const prisma = makePrisma();
      const context = makeContext();
      prisma.usuario.findUnique.mockResolvedValue({ idUsuario: 3 });
      prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 1 });
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      await service.assertUserAssignableToProject(5, 3, null);

      expect(prisma.participacionProyecto.findFirst).toHaveBeenCalledWith({
        where: {
          idUsuario: 3,
          estadoParticipacion: 'ACTIVO',
          rolProyecto: { idProyecto: 5 },
        },
        select: { idParticipacion: true },
      });
      const where = prisma.participacionProyecto.findFirst.mock.calls[0][0].where;
      expect(where).not.toHaveProperty('idRolProyecto');
    });

    it('usa el cliente transaccional en usuario.findUnique y participacionProyecto.findFirst', async () => {
      const prisma = makePrisma();
      const tx = makePrisma();
      const context = makeContext();
      tx.usuario.findUnique.mockResolvedValue({ idUsuario: 3 });
      tx.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 1 });
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      await service.assertUserAssignableToProject(5, 3, null, tx as unknown as Prisma.TransactionClient);

      expect(tx.usuario.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.usuario.findUnique).not.toHaveBeenCalled();
      expect(tx.participacionProyecto.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.participacionProyecto.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('validateCreateTaskRelations', () => {
    it('tarea sin relaciones: no valida usuario y devuelve recursos undefined', async () => {
      const prisma = makePrisma();
      const context = makeContext();
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      const result = await service.validateCreateTaskRelations(5, {});

      expect(result).toEqual({ hito: undefined, rolProyecto: undefined, etiquetas: undefined });
      expect(prisma.usuario.findUnique).not.toHaveBeenCalled();
    });

    it('tarea con hito, rol y etiquetas (sin asignado): valida los tres recursos, sin tocar usuario', async () => {
      const prisma = makePrisma();
      const context = makeContext();
      context.getMilestoneInProjectOrThrow.mockResolvedValue(HITO);
      context.getRoleInProjectOrThrow.mockResolvedValue(ROL);
      context.getLabelsInProjectOrThrow.mockResolvedValue(ETIQUETAS);
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      const result = await service.validateCreateTaskRelations(5, {
        idHito: 4,
        idRolProyecto: 6,
        idsEtiquetas: [1, 2],
      });

      expect(result).toEqual({ hito: HITO, rolProyecto: ROL, etiquetas: ETIQUETAS });
      expect(prisma.usuario.findUnique).not.toHaveBeenCalled();
    });

    it('tarea con asignado y rol: usa idRolProyecto como rol efectivo', async () => {
      const prisma = makePrisma();
      const context = makeContext();
      context.getRoleInProjectOrThrow.mockResolvedValue(ROL);
      prisma.usuario.findUnique.mockResolvedValue({ idUsuario: 3 });
      prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 1 });
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      await service.validateCreateTaskRelations(5, { idRolProyecto: 6, idUsuarioAsignado: 3 });

      // Con rol, el filtro de participación debe incluir idRolProyecto: 6.
      expect(prisma.participacionProyecto.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ idRolProyecto: 6 }) }),
      );
    });

    /**
     * X1.1: caso multirol obligatorio — un usuario con DOS
     * ParticipacionProyecto ACTIVO en el mismo proyecto (rol A y rol B)
     * asignado a una tarea del rol B debe resolver EXACTAMENTE la
     * participación de rol B, nunca la de rol A. El mock de
     * `participacionProyecto.findFirst` sólo puede devolver una fila
     * (`findFirst`, no `findMany`), así que la identidad exacta se
     * demuestra devolviendo la fila de rol B (idParticipacion: 202,
     * deliberadamente distinta de la de rol A, 101, que NUNCA se consulta
     * porque el `where` ya filtra por idRolProyecto: 6) y verificando que
     * `idParticipacionAsignado` sea exactamente 202.
     */
    it('multirol: usuario con participación en ROL_A (101) y ROL_B (202), asignado por ROL_B, resuelve idParticipacionAsignado = 202 (nunca 101)', async () => {
      const prisma = makePrisma();
      const context = makeContext();
      const ROL_B = { idRolProyecto: 7, idProyecto: 5, nombreRol: 'QA' };
      context.getRoleInProjectOrThrow.mockResolvedValue(ROL_B);
      prisma.usuario.findUnique.mockResolvedValue({ idUsuario: 3 });
      // El where real exige idRolProyecto: 7 (ROL_B) — el mock simula que
      // PostgreSQL solo encuentra la fila de esa participación exacta,
      // nunca la de ROL_A (101), aunque el mismo usuario la tenga.
      prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 202 });
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      const recursos = await service.validateCreateTaskRelations(5, {
        idRolProyecto: 7,
        idUsuarioAsignado: 3,
      });

      expect(prisma.participacionProyecto.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ idUsuario: 3, idRolProyecto: 7, estadoParticipacion: 'ACTIVO' }),
        }),
      );
      expect(recursos.idParticipacionAsignado).toBe(202);
      expect(recursos.idParticipacionAsignado).not.toBe(101);
    });

    it('tarea con asignado sin rol: usa null como rol efectivo', async () => {
      const prisma = makePrisma();
      const context = makeContext();
      prisma.usuario.findUnique.mockResolvedValue({ idUsuario: 3 });
      prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 1 });
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      await service.validateCreateTaskRelations(5, { idUsuarioAsignado: 3 });

      const where = prisma.participacionProyecto.findFirst.mock.calls[0][0].where;
      expect(where).not.toHaveProperty('idRolProyecto');
    });

    it('asignado inválido (sin participación) propaga BadRequestException', async () => {
      const prisma = makePrisma();
      const context = makeContext();
      prisma.usuario.findUnique.mockResolvedValue({ idUsuario: 3 });
      prisma.participacionProyecto.findFirst.mockResolvedValue(null);
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      await expect(
        service.validateCreateTaskRelations(5, { idUsuarioAsignado: 3 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('con rol: usuario activo en OTRO rol es rechazado', async () => {
      const prisma = makePrisma();
      const context = makeContext();
      context.getRoleInProjectOrThrow.mockResolvedValue(ROL);
      prisma.usuario.findUnique.mockResolvedValue({ idUsuario: 3 });
      // El filtro idRolProyecto: 6 no coincide con la participación real (otro rol).
      prisma.participacionProyecto.findFirst.mockResolvedValue(null);
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      await expect(
        service.validateCreateTaskRelations(5, { idRolProyecto: 6, idUsuarioAsignado: 3 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rol de otro proyecto se rechaza antes de consultar al usuario', async () => {
      const prisma = makePrisma();
      const context = makeContext();
      context.getRoleInProjectOrThrow.mockRejectedValue(
        new BadRequestException('El rol con id 6 pertenece a otro proyecto'),
      );
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      await expect(
        service.validateCreateTaskRelations(5, { idRolProyecto: 6, idUsuarioAsignado: 3 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.usuario.findUnique).not.toHaveBeenCalled();
      expect(prisma.participacionProyecto.findFirst).not.toHaveBeenCalled();
    });

    it('una etiqueta inválida se rechaza antes de consultar al usuario', async () => {
      const prisma = makePrisma();
      const context = makeContext();
      context.getLabelsInProjectOrThrow.mockRejectedValue(
        new NotFoundException('Etiqueta(s) con id 999 no encontrada(s)'),
      );
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      await expect(
        service.validateCreateTaskRelations(5, { idsEtiquetas: [999], idUsuarioAsignado: 3 }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.usuario.findUnique).not.toHaveBeenCalled();
      expect(prisma.participacionProyecto.findFirst).not.toHaveBeenCalled();
    });

    describe('el rol se consulta una sola vez (Tarea 17.B)', () => {
      it('con rol y asignado: getRoleInProjectOrThrow, usuario.findUnique y participacionProyecto.findFirst se llaman exactamente una vez cada uno', async () => {
        const prisma = makePrisma();
        const context = makeContext();
        context.getRoleInProjectOrThrow.mockResolvedValue(ROL);
        prisma.usuario.findUnique.mockResolvedValue({ idUsuario: 3 });
        prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 1 });
        const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

        await service.validateCreateTaskRelations(5, {
          idRolProyecto: 6,
          idUsuarioAsignado: 3,
        });

        expect(context.getRoleInProjectOrThrow).toHaveBeenCalledTimes(1);
        expect(prisma.usuario.findUnique).toHaveBeenCalledTimes(1);
        expect(prisma.participacionProyecto.findFirst).toHaveBeenCalledTimes(1);
      });

      it('sin rol y con asignado: cero consultas de rol, una de usuario, una de participación', async () => {
        const prisma = makePrisma();
        const context = makeContext();
        prisma.usuario.findUnique.mockResolvedValue({ idUsuario: 3 });
        prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 1 });
        const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

        await service.validateCreateTaskRelations(5, { idUsuarioAsignado: 3 });

        expect(context.getRoleInProjectOrThrow).not.toHaveBeenCalled();
        expect(prisma.usuario.findUnique).toHaveBeenCalledTimes(1);
        expect(prisma.participacionProyecto.findFirst).toHaveBeenCalledTimes(1);
      });

      it('el orden exacto es hito, rol, etiquetas, usuario, participación (sin repetir el rol)', async () => {
        const prisma = makePrisma();
        const context = makeContext();
        const orden: string[] = [];
        context.getMilestoneInProjectOrThrow.mockImplementation(async () => {
          orden.push('hito');
          return HITO;
        });
        context.getRoleInProjectOrThrow.mockImplementation(async () => {
          orden.push('rol');
          return ROL;
        });
        context.getLabelsInProjectOrThrow.mockImplementation(async () => {
          orden.push('etiquetas');
          return ETIQUETAS;
        });
        prisma.usuario.findUnique.mockImplementation(async () => {
          orden.push('usuario');
          return { idUsuario: 3 };
        });
        prisma.participacionProyecto.findFirst.mockImplementation(async () => {
          orden.push('participacion');
          return { idParticipacion: 1 };
        });
        const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

        await service.validateCreateTaskRelations(5, {
          idHito: 4,
          idRolProyecto: 6,
          idsEtiquetas: [1, 2],
          idUsuarioAsignado: 3,
        });

        expect(orden).toEqual(['hito', 'rol', 'etiquetas', 'usuario', 'participacion']);
        expect(context.getRoleInProjectOrThrow).toHaveBeenCalledTimes(1);
      });

      it('usa el mismo tx en validateRelatedResources, usuario.findUnique y participacionProyecto.findFirst, sin usar el PrismaService principal', async () => {
        const prisma = makePrisma();
        const tx = makePrisma();
        const context = makeContext();
        context.getRoleInProjectOrThrow.mockResolvedValue(ROL);
        tx.usuario.findUnique.mockResolvedValue({ idUsuario: 3 });
        tx.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 1 });
        const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

        await service.validateCreateTaskRelations(
          5,
          { idRolProyecto: 6, idUsuarioAsignado: 3 },
          tx as unknown as Prisma.TransactionClient,
        );

        expect(context.getRoleInProjectOrThrow).toHaveBeenCalledWith(5, 6, tx);
        expect(tx.usuario.findUnique).toHaveBeenCalledTimes(1);
        expect(prisma.usuario.findUnique).not.toHaveBeenCalled();
        expect(tx.participacionProyecto.findFirst).toHaveBeenCalledTimes(1);
        expect(prisma.participacionProyecto.findFirst).not.toHaveBeenCalled();
      });
    });

    it('devuelve exactamente los recursos validados por validateRelatedResources', async () => {
      const prisma = makePrisma();
      const context = makeContext();
      context.getMilestoneInProjectOrThrow.mockResolvedValue(HITO);
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      const result = await service.validateCreateTaskRelations(5, { idHito: 4 });

      expect(result.hito).toBe(HITO);
      expect(result.rolProyecto).toBeUndefined();
      expect(result.etiquetas).toBeUndefined();
    });

    it('no realiza ninguna escritura Prisma (create/$transaction) en ningún escenario', async () => {
      const prisma = makePrisma();
      const context = makeContext();
      context.getMilestoneInProjectOrThrow.mockResolvedValue(HITO);
      context.getRoleInProjectOrThrow.mockResolvedValue(ROL);
      context.getLabelsInProjectOrThrow.mockResolvedValue(ETIQUETAS);
      prisma.usuario.findUnique.mockResolvedValue({ idUsuario: 3 });
      prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 1 });
      const service = new TasksRelationsService(prisma as unknown as PrismaService, context as unknown as TasksContextService);

      await service.validateCreateTaskRelations(5, {
        idHito: 4,
        idRolProyecto: 6,
        idsEtiquetas: [1, 2],
        idUsuarioAsignado: 3,
      });

      expect(prisma.tarea.create).not.toHaveBeenCalled();
      expect(prisma.asignacionTarea.create).not.toHaveBeenCalled();
      expect(prisma.tareaEtiqueta.create).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
