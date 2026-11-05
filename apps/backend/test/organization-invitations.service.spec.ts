import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrganizationInvitationsService } from '../src/organizations/organization-invitations.service';

const ORG = { idOrganizacion: 1, nombreOrganizacion: 'Robotica', estadoOrganizacion: 'ACTIVA', visibilidad: 'PUBLICA' };
const FUTURO = new Date(Date.now() + 86_400_000);
const PASADO = new Date(Date.now() - 86_400_000);

function crearPrisma() {
  const prisma: Record<string, any> = {
    restriccionUsuario: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
    $queryRaw: vi.fn().mockResolvedValue([]),
    organizacion: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
    usuario: { findFirst: vi.fn(), findMany: vi.fn(), findUniqueOrThrow: vi.fn().mockResolvedValue({ nombre: 'Ana', apellido: 'Paz' }) },
    usuarioOrganizacion: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]), upsert: vi.fn() },
    invitacionOrganizacion: { create: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
    solicitudUnirseOrganizacion: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
    bitacoraAuditoria: { create: vi.fn().mockResolvedValue({}) },
  };
  prisma.$transaction = vi.fn(async (cb: (tx: unknown) => unknown) => cb(prisma));
  return prisma;
}

describe('OrganizationInvitationsService', () => {
  let prisma: ReturnType<typeof crearPrisma>;
  let notifications: { notifyFromTemplate: ReturnType<typeof vi.fn> };
  let chat: { sincronizarSinFallar: ReturnType<typeof vi.fn> };
  let service: OrganizationInvitationsService;
  let otros: Record<number, { rolOrganizacion: string; estadoMembresia: string }>;

  /** El usuario 10 actúa con `rol` (o sin membresía) en la organización 1. */
  function actuar(rol: string | null, org: Partial<typeof ORG> = {}) {
    prisma.organizacion.findUnique.mockResolvedValue({ ...ORG, ...org });
    prisma.usuarioOrganizacion.findUnique.mockImplementation(async ({ where }: any) => {
      const id = where.idUsuario_idOrganizacion.idUsuario;
      if (id === 10) return rol ? { rolOrganizacion: rol, estadoMembresia: 'ACTIVA' } : null;
      return otros[id] ?? null;
    });
  }

  beforeEach(() => {
    prisma = crearPrisma();
    otros = {};
    notifications = { notifyFromTemplate: vi.fn().mockResolvedValue(undefined) };
    chat = { sincronizarSinFallar: vi.fn().mockResolvedValue(undefined) };
    service = new OrganizationInvitationsService(prisma as never, notifications as never, chat as never);
  });

  describe('invite', () => {
    const invitado = { idUsuario: 20, nombre: 'Luis', apellido: 'Gil', estado: 'ACTIVO', rolesAcceso: [] };

    it('Editor y Lectura no invitan', async () => {
      actuar('EDITOR');
      await expect(service.invite(10, 1, { idUsuario: 20, rolOrganizacion: 'LECTURA' } as never)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('un Administrador no invita como Administrador', async () => {
      actuar('ADMINISTRADOR');
      await expect(service.invite(10, 1, { idUsuario: 20, rolOrganizacion: 'ADMINISTRADOR' } as never)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('no invita a cuentas no activas ni a administradores del sistema', async () => {
      actuar('PROPIETARIO');
      prisma.usuario.findFirst.mockResolvedValue({ ...invitado, estado: 'BLOQUEADO' });
      await expect(service.invite(10, 1, { idUsuario: 20, rolOrganizacion: 'EDITOR' } as never)).rejects.toBeInstanceOf(BadRequestException);
      prisma.usuario.findFirst.mockResolvedValue({ ...invitado, rolesAcceso: [{ idUsuarioRolAcceso: 1 }] });
      await expect(service.invite(10, 1, { idUsuario: 20, rolOrganizacion: 'EDITOR' } as never)).rejects.toBeInstanceOf(BadRequestException);
      prisma.usuario.findFirst.mockResolvedValue(null);
      await expect(service.invite(10, 1, { correo: 'x@uvg.edu.gt', rolOrganizacion: 'EDITOR' } as never)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('MEJ-153: con un bloqueo es 403 y no crea la invitacion', async () => {
      actuar('PROPIETARIO');
      prisma.usuario.findFirst.mockResolvedValue(invitado);
      prisma.restriccionUsuario.findFirst.mockResolvedValue({ idRestriccion: 1 });
      await expect(service.invite(10, 1, { idUsuario: 20, rolOrganizacion: 'EDITOR' } as never)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.invitacionOrganizacion.create).not.toHaveBeenCalled();
      expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
    });

    it('no invita a quien ya es miembro', async () => {
      actuar('PROPIETARIO');
      otros[20] = { rolOrganizacion: 'LECTURA', estadoMembresia: 'ACTIVA' };
      prisma.usuario.findFirst.mockResolvedValue(invitado);
      await expect(service.invite(10, 1, { idUsuario: 20, rolOrganizacion: 'EDITOR' } as never)).rejects.toBeInstanceOf(ConflictException);
    });

    it('crea la invitación con vencimiento a 14 días, audita y avisa al invitado', async () => {
      actuar('PROPIETARIO');
      prisma.usuario.findFirst.mockResolvedValue(invitado);
      prisma.invitacionOrganizacion.create.mockResolvedValue({ idInvitacion: 5, invitado: { idUsuario: 20 } });
      const antes = Date.now();
      await service.invite(10, 1, { idUsuario: 20, rolOrganizacion: 'EDITOR' } as never);
      const data = prisma.invitacionOrganizacion.create.mock.calls[0][0].data;
      expect(data).toMatchObject({ idOrganizacion: 1, idInvitado: 20, idInvitadoPor: 10, rolOrganizacion: 'EDITOR' });
      const dias = (data.venceEn.getTime() - antes) / 86_400_000;
      expect(dias).toBeGreaterThan(13.99);
      expect(dias).toBeLessThan(14.01);
      expect(prisma.bitacoraAuditoria.create.mock.calls[0][0].data.accion).toBe('ORG_INVITACION_ENVIADA');
      expect(notifications.notifyFromTemplate).toHaveBeenCalledWith([20], 'INVITACION_ORGANIZACION', expect.objectContaining({ invitationId: 5 }));
    });

    it('una invitación pendiente repetida (P2002) es conflicto', async () => {
      actuar('PROPIETARIO');
      prisma.usuario.findFirst.mockResolvedValue(invitado);
      prisma.invitacionOrganizacion.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
      await expect(service.invite(10, 1, { idUsuario: 20, rolOrganizacion: 'EDITOR' } as never)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('candidates', () => {
    it('exige rol de gestión y devuelve vacío con menos de 3 letras', async () => {
      actuar('LECTURA');
      await expect(service.candidates(10, 1, 'ana')).rejects.toBeInstanceOf(ForbiddenException);
      actuar('ADMINISTRADOR');
      expect(await service.candidates(10, 1, 'an')).toEqual([]);
      expect(prisma.usuario.findMany).not.toHaveBeenCalled();
    });
  });

  describe('respond', () => {
    const invitacion = (extra = {}) => ({
      idInvitado: 10,
      idInvitadoPor: 30,
      idOrganizacion: 1,
      rolOrganizacion: 'EDITOR',
      estado: 'PENDIENTE',
      venceEn: FUTURO,
      ...extra,
    });

    beforeEach(() => {
      prisma.invitacionOrganizacion.findUnique.mockResolvedValue({ idOrganizacion: 1 });
      prisma.organizacion.findUniqueOrThrow.mockResolvedValue({ nombreOrganizacion: 'Robotica', estadoOrganizacion: 'ACTIVA' });
      otros[30] = { rolOrganizacion: 'PROPIETARIO', estadoMembresia: 'ACTIVA' };
      actuar(null);
    });

    it('una invitación ajena es indistinguible de una inexistente', async () => {
      prisma.invitacionOrganizacion.findUniqueOrThrow.mockResolvedValue(invitacion({ idInvitado: 99 }));
      await expect(service.respond(10, 5, true)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('no acepta una resuelta, una vencida ni de una organización archivada', async () => {
      prisma.invitacionOrganizacion.findUniqueOrThrow.mockResolvedValue(invitacion({ estado: 'RECHAZADA' }));
      await expect(service.respond(10, 5, true)).rejects.toBeInstanceOf(ConflictException);
      prisma.invitacionOrganizacion.findUniqueOrThrow.mockResolvedValue(invitacion({ venceEn: PASADO }));
      await expect(service.respond(10, 5, true)).rejects.toBeInstanceOf(ConflictException);
      prisma.invitacionOrganizacion.findUniqueOrThrow.mockResolvedValue(invitacion());
      prisma.organizacion.findUniqueOrThrow.mockResolvedValue({ nombreOrganizacion: 'Robotica', estadoOrganizacion: 'INACTIVA' });
      await expect(service.respond(10, 5, true)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.usuarioOrganizacion.upsert).not.toHaveBeenCalled();
    });

    it('no acepta si quien invitó ya perdió el permiso', async () => {
      prisma.invitacionOrganizacion.findUniqueOrThrow.mockResolvedValue(invitacion());
      otros[30] = { rolOrganizacion: 'EDITOR', estadoMembresia: 'ACTIVA' };
      await expect(service.respond(10, 5, true)).rejects.toBeInstanceOf(ConflictException);
    });

    it('aceptar crea la membresía con el rol invitado y sincroniza el chat', async () => {
      prisma.invitacionOrganizacion.findUniqueOrThrow.mockResolvedValue(invitacion());
      const res = await service.respond(10, 5, true);
      expect(res).toEqual({ idInvitacion: 5, idOrganizacion: 1, aceptada: true });
      expect(prisma.usuarioOrganizacion.upsert.mock.calls[0][0].create).toMatchObject({ idUsuario: 10, rolOrganizacion: 'EDITOR' });
      expect(prisma.invitacionOrganizacion.update.mock.calls[0][0].data.estado).toBe('ACEPTADA');
      expect(chat.sincronizarSinFallar).toHaveBeenCalledWith(1);
      expect(notifications.notifyFromTemplate).toHaveBeenCalledWith([30], 'ORGANIZACION_ACTUALIZADA', expect.anything());
    });

    it('rechazar no crea membresía ni toca el chat', async () => {
      prisma.invitacionOrganizacion.findUniqueOrThrow.mockResolvedValue(invitacion());
      await service.respond(10, 5, false);
      expect(prisma.usuarioOrganizacion.upsert).not.toHaveBeenCalled();
      expect(prisma.invitacionOrganizacion.update.mock.calls[0][0].data.estado).toBe('RECHAZADA');
      expect(chat.sincronizarSinFallar).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('Editor no cancela; una inexistente es 404', async () => {
      actuar('EDITOR');
      await expect(service.cancel(10, 1, 5)).rejects.toBeInstanceOf(ForbiddenException);
      actuar('ADMINISTRADOR');
      prisma.invitacionOrganizacion.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.cancel(10, 1, 5)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('requestJoin', () => {
    it('una privada no recibe solicitudes', async () => {
      actuar(null, { visibilidad: 'PRIVADA' });
      await expect(service.requestJoin(10, 1)).rejects.toBeInstanceOf(NotFoundException);
      actuar('LECTURA', { visibilidad: 'PRIVADA' });
      await expect(service.requestJoin(10, 1)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('un miembro no solicita unirse', async () => {
      actuar('LECTURA');
      await expect(service.requestJoin(10, 1)).rejects.toBeInstanceOf(ConflictException);
    });

    it('crea la solicitud y avisa a propietario y administradores', async () => {
      actuar(null);
      prisma.solicitudUnirseOrganizacion.create.mockResolvedValue({ idSolicitud: 7 });
      prisma.usuarioOrganizacion.findMany.mockResolvedValue([{ idUsuario: 30 }, { idUsuario: 31 }]);
      const res = await service.requestJoin(10, 1);
      expect(res).toEqual({ idSolicitud: 7 });
      expect(notifications.notifyFromTemplate).toHaveBeenCalledWith([30, 31], 'SOLICITUD_UNIRSE_ORGANIZACION', expect.objectContaining({ requestId: 7 }));
    });

    it('una solicitud pendiente repetida (P2002) es conflicto', async () => {
      actuar(null);
      prisma.solicitudUnirseOrganizacion.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
      await expect(service.requestJoin(10, 1)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('resolveRequest', () => {
    const solicitud = (extra = {}) => ({ idUsuario: 40, estado: 'PENDIENTE', venceEn: FUTURO, ...extra });

    it('Editor no resuelve solicitudes', async () => {
      actuar('EDITOR');
      await expect(service.resolveRequest(10, 1, 7, true)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('no resuelve una inexistente, resuelta o vencida', async () => {
      actuar('ADMINISTRADOR');
      prisma.solicitudUnirseOrganizacion.findFirst.mockResolvedValue(null);
      await expect(service.resolveRequest(10, 1, 7, true)).rejects.toBeInstanceOf(NotFoundException);
      prisma.solicitudUnirseOrganizacion.findFirst.mockResolvedValue(solicitud({ estado: 'ACEPTADA' }));
      await expect(service.resolveRequest(10, 1, 7, true)).rejects.toBeInstanceOf(ConflictException);
      prisma.solicitudUnirseOrganizacion.findFirst.mockResolvedValue(solicitud({ venceEn: PASADO }));
      await expect(service.resolveRequest(10, 1, 7, true)).rejects.toBeInstanceOf(ConflictException);
    });

    it('aceptar admite a la persona como Lectura', async () => {
      actuar('ADMINISTRADOR');
      prisma.solicitudUnirseOrganizacion.findFirst.mockResolvedValue(solicitud());
      await service.resolveRequest(10, 1, 7, true);
      expect(prisma.usuarioOrganizacion.upsert.mock.calls[0][0].create).toMatchObject({ idUsuario: 40, rolOrganizacion: 'LECTURA' });
      expect(prisma.solicitudUnirseOrganizacion.update.mock.calls[0][0].data).toMatchObject({ estado: 'ACEPTADA', resueltaPor: 10 });
      expect(notifications.notifyFromTemplate).toHaveBeenCalledWith([40], 'ORGANIZACION_ACTUALIZADA', expect.anything());
    });

    it('rechazar no crea membresía', async () => {
      actuar('PROPIETARIO');
      prisma.solicitudUnirseOrganizacion.findFirst.mockResolvedValue(solicitud());
      await service.resolveRequest(10, 1, 7, false);
      expect(prisma.usuarioOrganizacion.upsert).not.toHaveBeenCalled();
      expect(prisma.solicitudUnirseOrganizacion.update.mock.calls[0][0].data.estado).toBe('RECHAZADA');
    });
  });

  describe('listados', () => {
    it('invitaciones y solicitudes de la organización exigen rol de gestión', async () => {
      actuar('LECTURA');
      await expect(service.listForOrganization(10, 1)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.listRequests(10, 1)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('mis invitaciones solo trae las vigentes dirigidas al usuario', async () => {
      prisma.invitacionOrganizacion.findMany.mockResolvedValue([]);
      await service.listMine(10);
      const where = prisma.invitacionOrganizacion.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({ idInvitado: 10, estado: 'PENDIENTE' });
      expect(where.venceEn.gt).toBeInstanceOf(Date);
    });
  });
});
