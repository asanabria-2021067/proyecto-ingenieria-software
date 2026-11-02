import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrganizationsService } from '../src/organizations/organizations.service';

/** Prisma de mentira: la transacción ejecuta el callback sobre el mismo objeto. */
function crearPrisma() {
  const prisma: Record<string, any> = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    organizacion: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    usuarioOrganizacion: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
    invitacionOrganizacion: { updateMany: vi.fn() },
    solicitudUnirseOrganizacion: { updateMany: vi.fn() },
    bitacoraAuditoria: { create: vi.fn().mockResolvedValue({}), findMany: vi.fn(), count: vi.fn() },
  };
  prisma.$transaction = vi.fn(async (cb: (tx: unknown) => unknown) => cb(prisma));
  return prisma;
}

const ORG = { idOrganizacion: 1, nombreOrganizacion: 'Robotica', estadoOrganizacion: 'ACTIVA', visibilidad: 'PRIVADA' };

describe('OrganizationsService', () => {
  let prisma: ReturnType<typeof crearPrisma>;
  let notifications: { notifyFromTemplate: ReturnType<typeof vi.fn> };
  let chat: { sincronizarSinFallar: ReturnType<typeof vi.fn> };
  let cache: { del: ReturnType<typeof vi.fn> };
  let service: OrganizationsService;

  /** Quién es el usuario que actúa y qué rol tiene en la organización 1. */
  function actuar(rol: string | null, org: Partial<typeof ORG> = {}) {
    prisma.organizacion.findUnique.mockResolvedValue({ ...ORG, ...org });
    prisma.usuarioOrganizacion.findUnique.mockImplementation(async ({ where }: any) => {
      const id = where.idUsuario_idOrganizacion.idUsuario;
      if (id === 10) return rol ? { rolOrganizacion: rol, estadoMembresia: 'ACTIVA' } : null;
      return objetivos[id] ?? null;
    });
  }
  let objetivos: Record<number, { rolOrganizacion: string; estadoMembresia: string }>;

  beforeEach(() => {
    prisma = crearPrisma();
    objetivos = {};
    notifications = { notifyFromTemplate: vi.fn().mockResolvedValue(undefined) };
    chat = { sincronizarSinFallar: vi.fn().mockResolvedValue(undefined) };
    cache = { del: vi.fn().mockResolvedValue(undefined) };
    service = new OrganizationsService(prisma as never, notifications as never, chat as never, cache as never);
  });

  describe('create', () => {
    it('crea la organización con el creador como Propietario, audita y sincroniza el chat', async () => {
      prisma.organizacion.findFirst.mockResolvedValue(null);
      prisma.organizacion.create.mockResolvedValue({ ...ORG, descripcionOrganizacion: null, sitioWeb: null, logoUrl: null, fechaCreacion: new Date() });
      const res = await service.create(10, { nombreOrganizacion: 'Robotica' } as never);
      const data = prisma.organizacion.create.mock.calls[0][0].data;
      expect(data.visibilidad).toBe('PRIVADA');
      expect(data.miembros.create).toEqual({ idUsuario: 10, rolOrganizacion: 'PROPIETARIO' });
      expect(res.miRol).toBe('PROPIETARIO');
      expect(res.puedePublicar).toBe(true);
      expect(prisma.bitacoraAuditoria.create.mock.calls[0][0].data.accion).toBe('ORG_CREADA');
      expect(chat.sincronizarSinFallar).toHaveBeenCalledWith(1);
      expect(cache.del).toHaveBeenCalled();
    });

    it('rechaza un nombre repetido (sin distinguir mayúsculas)', async () => {
      prisma.organizacion.findFirst.mockResolvedValue({ idOrganizacion: 2 });
      await expect(service.create(10, { nombreOrganizacion: 'robotica' } as never)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.organizacion.create).not.toHaveBeenCalled();
    });

    it('traduce la carrera del índice único (P2002) a conflicto', async () => {
      prisma.organizacion.findFirst.mockResolvedValue(null);
      prisma.organizacion.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
      await expect(service.create(10, { nombreOrganizacion: 'Robotica' } as never)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('update', () => {
    it('un Editor no edita los datos', async () => {
      actuar('EDITOR');
      await expect(service.update(10, 1, { descripcionOrganizacion: 'x' } as never)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('un Administrador no cambia la visibilidad', async () => {
      actuar('ADMINISTRADOR');
      await expect(service.update(10, 1, { visibilidad: 'PUBLICA' } as never)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.organizacion.update).not.toHaveBeenCalled();
    });

    it('el Propietario cambia la visibilidad', async () => {
      actuar('PROPIETARIO');
      prisma.organizacion.update.mockResolvedValue({ ...ORG, visibilidad: 'PUBLICA' });
      const res = await service.update(10, 1, { visibilidad: 'PUBLICA' } as never);
      expect(res.visibilidad).toBe('PUBLICA');
    });

    it('una organización archivada no se edita', async () => {
      actuar('PROPIETARIO', { estadoOrganizacion: 'INACTIVA' });
      await expect(service.update(10, 1, {} as never)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('detail', () => {
    it('una privada no revela su existencia a quien no es miembro', async () => {
      actuar(null);
      await expect(service.detail(10, 1)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('changeRole', () => {
    it('Lectura y Editor no cambian roles', async () => {
      for (const rol of ['LECTURA', 'EDITOR']) {
        actuar(rol);
        await expect(service.changeRole(10, 1, 20, 'EDITOR' as never)).rejects.toBeInstanceOf(ForbiddenException);
      }
    });

    it('nadie cambia su propio rol', async () => {
      actuar('PROPIETARIO');
      await expect(service.changeRole(10, 1, 10, 'EDITOR' as never)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('el rol del Propietario no se cambia', async () => {
      actuar('ADMINISTRADOR');
      objetivos[20] = { rolOrganizacion: 'PROPIETARIO', estadoMembresia: 'ACTIVA' };
      await expect(service.changeRole(10, 1, 20, 'LECTURA' as never)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('un Administrador no nombra ni degrada administradores', async () => {
      actuar('ADMINISTRADOR');
      objetivos[20] = { rolOrganizacion: 'EDITOR', estadoMembresia: 'ACTIVA' };
      await expect(service.changeRole(10, 1, 20, 'ADMINISTRADOR' as never)).rejects.toBeInstanceOf(ForbiddenException);
      objetivos[21] = { rolOrganizacion: 'ADMINISTRADOR', estadoMembresia: 'ACTIVA' };
      await expect(service.changeRole(10, 1, 21, 'LECTURA' as never)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.usuarioOrganizacion.update).not.toHaveBeenCalled();
    });

    it('el objetivo debe ser miembro activo', async () => {
      actuar('PROPIETARIO');
      await expect(service.changeRole(10, 1, 20, 'EDITOR' as never)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('el Propietario cambia el rol, audita y avisa al afectado', async () => {
      actuar('PROPIETARIO');
      objetivos[20] = { rolOrganizacion: 'LECTURA', estadoMembresia: 'ACTIVA' };
      const res = await service.changeRole(10, 1, 20, 'ADMINISTRADOR' as never);
      expect(res).toEqual({ idUsuario: 20, rolOrganizacion: 'ADMINISTRADOR' });
      expect(prisma.usuarioOrganizacion.update.mock.calls[0][0].data).toEqual({ rolOrganizacion: 'ADMINISTRADOR' });
      expect(prisma.bitacoraAuditoria.create.mock.calls[0][0].data.accion).toBe('ORG_ROL_CAMBIADO');
      expect(notifications.notifyFromTemplate).toHaveBeenCalledWith([20], 'ORGANIZACION_ACTUALIZADA', expect.anything());
    });
  });

  describe('removeMember', () => {
    it('no se quita al Propietario ni a uno mismo', async () => {
      actuar('ADMINISTRADOR');
      objetivos[20] = { rolOrganizacion: 'PROPIETARIO', estadoMembresia: 'ACTIVA' };
      await expect(service.removeMember(10, 1, 20)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.removeMember(10, 1, 10)).rejects.toThrow();
    });

    it('un Administrador no quita a otro Administrador', async () => {
      actuar('ADMINISTRADOR');
      objetivos[20] = { rolOrganizacion: 'ADMINISTRADOR', estadoMembresia: 'ACTIVA' };
      await expect(service.removeMember(10, 1, 20)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('quita al miembro, sincroniza el chat y avisa', async () => {
      actuar('ADMINISTRADOR');
      objetivos[20] = { rolOrganizacion: 'EDITOR', estadoMembresia: 'ACTIVA' };
      await service.removeMember(10, 1, 20);
      expect(prisma.usuarioOrganizacion.delete).toHaveBeenCalled();
      expect(chat.sincronizarSinFallar).toHaveBeenCalledWith(1);
      expect(notifications.notifyFromTemplate).toHaveBeenCalledWith([20], 'ORGANIZACION_ACTUALIZADA', expect.anything());
    });
  });

  describe('leave', () => {
    it('el Propietario no sale sin transferir', async () => {
      actuar('PROPIETARIO');
      await expect(service.leave(10, 1)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.usuarioOrganizacion.delete).not.toHaveBeenCalled();
    });

    it('un miembro sale y queda en la bitácora', async () => {
      actuar('LECTURA');
      await service.leave(10, 1);
      expect(prisma.usuarioOrganizacion.delete).toHaveBeenCalled();
      expect(prisma.bitacoraAuditoria.create.mock.calls[0][0].data.accion).toBe('ORG_MIEMBRO_SALIO');
    });
  });

  describe('transferOwnership', () => {
    it('solo el Propietario transfiere', async () => {
      actuar('ADMINISTRADOR');
      await expect(service.transferOwnership(10, 1, 20)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('solo a un miembro activo', async () => {
      actuar('PROPIETARIO');
      objetivos[20] = { rolOrganizacion: 'EDITOR', estadoMembresia: 'INACTIVA' };
      await expect(service.transferOwnership(10, 1, 20)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('degrada primero al actual y deja un solo Propietario', async () => {
      actuar('PROPIETARIO');
      objetivos[20] = { rolOrganizacion: 'EDITOR', estadoMembresia: 'ACTIVA' };
      await service.transferOwnership(10, 1, 20);
      const cambios = prisma.usuarioOrganizacion.update.mock.calls.map(([a]: any) => [a.where.idUsuario_idOrganizacion.idUsuario, a.data.rolOrganizacion]);
      expect(cambios).toEqual([
        [10, 'ADMINISTRADOR'],
        [20, 'PROPIETARIO'],
      ]);
    });
  });

  describe('archive', () => {
    it('solo el Propietario archiva', async () => {
      actuar('ADMINISTRADOR');
      await expect(service.archive(10, 1)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('no se archiva dos veces', async () => {
      actuar('PROPIETARIO', { estadoOrganizacion: 'INACTIVA' });
      await expect(service.archive(10, 1)).rejects.toBeInstanceOf(ConflictException);
    });

    it('archiva, cancela pendientes y avisa a los demás miembros', async () => {
      actuar('PROPIETARIO');
      prisma.usuarioOrganizacion.findMany.mockResolvedValue([{ idUsuario: 20 }, { idUsuario: 21 }]);
      const res = await service.archive(10, 1);
      expect(res).toEqual({ idOrganizacion: 1, archivada: true });
      expect(prisma.organizacion.update.mock.calls[0][0].data).toEqual({ estadoOrganizacion: 'INACTIVA' });
      expect(prisma.invitacionOrganizacion.updateMany.mock.calls[0][0].data.estado).toBe('CANCELADA');
      expect(prisma.solicitudUnirseOrganizacion.updateMany.mock.calls[0][0].data.estado).toBe('CANCELADA');
      expect(notifications.notifyFromTemplate).toHaveBeenCalledWith([20, 21], 'ORGANIZACION_ACTUALIZADA', expect.anything());
    });
  });

  describe('auditLog', () => {
    it('Editor y Lectura no ven la bitácora', async () => {
      actuar('EDITOR');
      await expect(service.auditLog(10, 1, {})).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('un Administrador la ve paginada', async () => {
      actuar('ADMINISTRADOR');
      prisma.bitacoraAuditoria.findMany.mockResolvedValue([{ idAuditoria: 1 }]);
      prisma.bitacoraAuditoria.count.mockResolvedValue(21);
      const res = await service.auditLog(10, 1, { page: 2, limit: 20 });
      expect(res).toMatchObject({ total: 21, page: 2, totalPages: 2 });
      expect(prisma.bitacoraAuditoria.findMany.mock.calls[0][0].skip).toBe(20);
    });
  });

  describe('search', () => {
    it('solo busca públicas y activas', async () => {
      prisma.organizacion.findMany.mockResolvedValue([]);
      prisma.organizacion.count.mockResolvedValue(0);
      await service.search(10, { q: ' rob ' });
      const where = prisma.organizacion.findMany.mock.calls[0][0].where;
      expect(where.visibilidad).toBe('PUBLICA');
      expect(where.estadoOrganizacion).toBe('ACTIVA');
      expect(where.nombreOrganizacion.contains).toBe('rob');
    });
  });
});
