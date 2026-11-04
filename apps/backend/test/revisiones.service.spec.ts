import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EstadoProyecto } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { NotificationsService } from '../src/notifications/notifications.service';
import { RevisionesService } from '../src/revisiones/revisiones.service';
import {
  makeProjectPolicyDouble,
  makeProjectReadPolicyDouble,
  makeProjectTransactionDouble,
} from './helpers/project-policy.double';

/**
 * C039: reclamar/resolver corren dentro del `run` del protocolo; el doble del
 * runner entrega este mismo mock como `tx`, por lo que todas las escrituras
 * de la transición se observan en los delegates raíz.
 */
function makePrisma() {
  return {
    revisionProyecto: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    revisionCierreProyecto: { findMany: vi.fn().mockResolvedValue([{ idRevisionCierre: 2 }]) },
    proyecto: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    usuario: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    seguimientoEntidad: { findMany: vi.fn().mockResolvedValue([]) },
    notificacion: { create: vi.fn() },
    usuarioRolAcceso: { findFirst: vi.fn().mockResolvedValue(null) },
    alcanceCoordinador: { findMany: vi.fn().mockResolvedValue([]) },
    carrera: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

function makeService(
  prisma: ReturnType<typeof makePrisma>,
  notifications: Partial<NotificationsService> = {},
) {
  return new RevisionesService(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
    makeProjectTransactionDouble({ tx: prisma }),
    makeProjectPolicyDouble(),
    makeProjectReadPolicyDouble(),
  );
}

describe('RevisionesService', () => {
  it('findAdminInbox requiere admin', async () => {
    const service = makeService(makePrisma(), { isAdmin: vi.fn().mockResolvedValue(false) });
    await expect(service.findAdminInbox(1)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('findAdminInbox del coordinador filtra las tres bandejas a su alcance', async () => {
    const prisma = makePrisma();
    prisma.usuarioRolAcceso.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ idUsuarioRolAcceso: 1 })
      .mockResolvedValueOnce({ idUsuarioRolAcceso: 1 });
    prisma.alcanceCoordinador.findMany.mockResolvedValue([{ idCarrera: 5, facultad: null }]);
    prisma.revisionProyecto.findMany.mockResolvedValue([]);
    prisma.proyecto.findMany.mockResolvedValue([]);
    await makeService(prisma).findAdminInbox(9);
    const enAlcance = expect.objectContaining({ OR: expect.any(Array) });
    expect(prisma.revisionProyecto.findMany.mock.calls[0][0].where.proyecto).toEqual(enAlcance);
    expect(prisma.revisionCierreProyecto.findMany.mock.calls[0][0].where.proyecto).toEqual(enAlcance);
    expect(prisma.proyecto.findMany.mock.calls[0][0].where).toEqual(enAlcance);
  });

  it('findAdminInbox retorna ambas bandejas', async () => {
    const prisma = makePrisma();
    prisma.usuarioRolAcceso.findFirst.mockResolvedValue({ idUsuarioRolAcceso: 1 });
    prisma.revisionProyecto.findMany.mockResolvedValue([{ idRevisionProyecto: 1 }]);
    prisma.proyecto.findMany.mockResolvedValue([{ idProyecto: 2 }]);
    const service = makeService(prisma, {
      isAdmin: vi.fn().mockResolvedValue(true),
      notifyFromTemplate: vi.fn(),
    });
    const result = await service.findAdminInbox(1);
    expect(result.revisionesPendientes).toHaveLength(1);
    expect(result.cierresPendientes).toHaveLength(1);
  });

  it('findByProyecto valida existencia', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(null);
    const service = makeService(prisma, { isAdmin: vi.fn() });
    await expect(service.findByProyecto(1, 1)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reclamar falla si no hay revisión pendiente', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findUnique.mockResolvedValue({ estadoProyecto: EstadoProyecto.EN_REVISION });
    prisma.revisionProyecto.findFirst.mockResolvedValue(null);
    const notifications = {
      isAdmin: vi.fn().mockResolvedValue(true),
      notifyFromTemplate: vi.fn(),
    };
    const service = makeService(prisma, notifications);
    await expect(service.reclamar(1, 7)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('resolver requiere que el mismo admin haya reclamado', async () => {
    const prisma = makePrisma();
    prisma.revisionProyecto.findFirst.mockResolvedValue({ idRevisionProyecto: 4, idRevisor: 8 });
    const notifications = {
      isAdmin: vi.fn().mockResolvedValue(true),
      notifyFromTemplate: vi.fn(),
    };
    const service = makeService(prisma, notifications);
    await expect(service.resolver(1, 7, { resultado: 'APROBADA' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('resolver actualiza revision y proyecto', async () => {
    const prisma = makePrisma();
    prisma.revisionProyecto.findFirst.mockResolvedValue({ idRevisionProyecto: 4, idRevisor: 7 });
    prisma.revisionProyecto.update.mockResolvedValue({ idRevisionProyecto: 4, estadoRevision: 'APROBADA' });
    prisma.proyecto.findUnique.mockResolvedValue({
      creadoPor: 2,
      tituloProyecto: 'Proyecto',
      idAsociacion: null,
      asociacion: null,
      organizaciones: [],
      intereses: [{ idInteres: 4 }],
      roles: [{ idCarreraRequerida: 3 }],
    });
    // MEJ-16: la aprobación también avisa a quien coincide por carrera (31) o por interés (32).
    prisma.usuario.findMany.mockResolvedValueOnce([{ idUsuario: 31 }]).mockResolvedValueOnce([{ idUsuario: 32 }]);
    const notifications = {
      isAdmin: vi.fn().mockResolvedValue(true),
      notifyFromTemplate: vi.fn(),
    };
    const service = makeService(prisma, notifications);

    const result = await service.resolver(1, 7, { resultado: 'APROBADA', comentario: '' });

    expect(result.estadoProyecto).toBe(EstadoProyecto.PUBLICADO);
    // C039: la transición escribe sobre el `tx` del run (aquí, el mismo mock).
    expect(prisma.proyecto.update).toHaveBeenCalled();
    expect(notifications.notifyFromTemplate).toHaveBeenCalledWith(
      [2],
      'PROYECTO_APROBADO',
      expect.objectContaining({ projectId: 1, revisionId: 4 }),
      prisma,
    );
    expect(notifications.notifyFromTemplate).toHaveBeenCalledWith(
      [31],
      'PROYECTO_NUEVO_PARA_TI',
      expect.objectContaining({ projectId: 1, motivo: 'CARRERA' }),
      prisma,
    );
    expect(notifications.notifyFromTemplate).toHaveBeenCalledWith(
      [32],
      'PROYECTO_NUEVO_PARA_TI',
      expect.objectContaining({ projectId: 1, motivo: 'INTERES' }),
      prisma,
    );
  });

  it('observar un proyecto no dispara el aviso de proyecto nuevo', async () => {
    const prisma = makePrisma();
    prisma.revisionProyecto.findFirst.mockResolvedValue({ idRevisionProyecto: 4, idRevisor: 7 });
    prisma.revisionProyecto.update.mockResolvedValue({ idRevisionProyecto: 4, estadoRevision: 'OBSERVADA' });
    prisma.proyecto.findUnique.mockResolvedValue({ creadoPor: 2, tituloProyecto: 'Proyecto' });
    const notifications = { isAdmin: vi.fn().mockResolvedValue(true), notifyFromTemplate: vi.fn() };
    const service = makeService(prisma, notifications);

    await service.resolver(1, 7, { resultado: 'OBSERVADA', comentario: 'Falta detalle' });

    expect(notifications.notifyFromTemplate).toHaveBeenCalledTimes(1);
    expect(notifications.notifyFromTemplate.mock.calls[0][1]).toBe('PROYECTO_OBSERVADO');
  });

  it('reclamar falla con estado inválido', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findUnique.mockResolvedValue({ estadoProyecto: EstadoProyecto.PUBLICADO });
    const service = makeService(prisma, { isAdmin: vi.fn().mockResolvedValue(true) });
    await expect(service.reclamar(1, 1)).rejects.toBeInstanceOf(BadRequestException);
  });
});
