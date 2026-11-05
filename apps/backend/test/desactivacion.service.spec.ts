import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { DesactivacionService } from '../src/cuenta/desactivacion.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { NotificationsService } from '../src/notifications/notifications.service';
import type { SecurityEventsService } from '../src/security-events/security-events.service';
import type { EventEmitter2 } from '@nestjs/event-emitter';

const solicitud = (extra: Record<string, unknown> = {}) => ({
  idSolicitud: 5,
  idUsuario: 9,
  estado: 'PENDIENTE',
  motivo: null,
  creadaEn: new Date('2026-12-03T10:00:00Z'),
  resueltaEn: null,
  comentarioResolucion: null,
  ...extra,
});

function setup(opts: { admins?: number[]; estado?: string; existente?: unknown; creaFalla?: unknown } = {}) {
  const admins = opts.admins ?? [1];
  const tx = {
    solicitudDesactivacion: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi.fn().mockResolvedValue(solicitud({ estado: 'APROBADA' })),
    },
    usuario: { update: vi.fn().mockResolvedValue({}) },
    tokenRefresco: { updateMany: vi.fn().mockResolvedValue({ count: 3 }) },
  };
  const prisma = {
    usuarioRolAcceso: {
      findFirst: vi.fn(async ({ where }: { where: { idUsuario: number } }) =>
        admins.includes(where.idUsuario) ? { idUsuarioRolAcceso: 1 } : null,
      ),
    },
    usuario: {
      findUnique: vi.fn().mockResolvedValue({ nombre: 'Ana', apellido: 'Paz', estado: opts.estado ?? 'ACTIVO' }),
    },
    solicitudDesactivacion: {
      create: opts.creaFalla ? vi.fn().mockRejectedValue(opts.creaFalla) : vi.fn().mockResolvedValue(solicitud()),
      findUnique: vi.fn().mockResolvedValue(opts.existente === undefined ? solicitud() : opts.existente),
      findUniqueOrThrow: vi.fn().mockResolvedValue(solicitud({ estado: 'RECHAZADA' })),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn(async (cb: (c: unknown) => unknown) => cb(tx)),
    horasParticipacion: { deleteMany: vi.fn() },
    participacionProyecto: { deleteMany: vi.fn(), updateMany: vi.fn() },
  };
  const notifications = {
    notifyAdminsFromTemplate: vi.fn().mockResolvedValue(undefined),
    notifyFromTemplate: vi.fn().mockResolvedValue(undefined),
  };
  const eventos = { record: vi.fn().mockResolvedValue(true) };
  const emitter = { emit: vi.fn() };
  const servicio = new DesactivacionService(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
    eventos as unknown as SecurityEventsService,
    emitter as unknown as EventEmitter2,
  );
  return { servicio, prisma, tx, notifications, eventos, emitter };
}

describe('MEJ-85 solicitar', () => {
  it('crea la solicitud pendiente y avisa a los administradores', async () => {
    const { servicio, prisma, notifications } = setup();

    const r = await servicio.solicitar(9, '  Me voy  ');

    expect(prisma.solicitudDesactivacion.create).toHaveBeenCalledWith({ data: { idUsuario: 9, motivo: 'Me voy' } });
    expect(notifications.notifyAdminsFromTemplate).toHaveBeenCalledWith('SOLICITUD_DESACTIVACION', {
      userName: 'Ana Paz',
      solicitudId: 5,
      userId: 9,
    });
    expect(r.estado).toBe('PENDIENTE');
  });

  it('una segunda solicitud pendiente (indice unico) responde 409 y no avisa', async () => {
    const error = new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' });
    const { servicio, notifications } = setup({ creaFalla: error });

    await expect(servicio.solicitar(9)).rejects.toBeInstanceOf(ConflictException);
    expect(notifications.notifyAdminsFromTemplate).not.toHaveBeenCalled();
  });

  it('un administrador no puede pedir desactivar su cuenta', async () => {
    const { servicio, prisma } = setup({ admins: [9] });

    await expect(servicio.solicitar(9)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.solicitudDesactivacion.create).not.toHaveBeenCalled();
  });

  it('una cuenta que no esta activa no puede solicitar', async () => {
    const { servicio } = setup({ estado: 'INACTIVO' });

    await expect(servicio.solicitar(9)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('MEJ-85 resolver', () => {
  it('aprobar marca la cuenta inactiva, sube sesionVersion, cierra sesiones y notifica; no borra nada', async () => {
    const { servicio, prisma, tx, notifications, eventos, emitter } = setup();

    const r = await servicio.aprobar(1, 5, 'Listo');

    expect(tx.solicitudDesactivacion.updateMany).toHaveBeenCalledWith({
      where: { idSolicitud: 5, estado: 'PENDIENTE' },
      data: expect.objectContaining({ estado: 'APROBADA', resueltaPor: 1 }),
    });
    expect(tx.usuario.update).toHaveBeenCalledWith({
      where: { idUsuario: 9 },
      data: { estado: 'INACTIVO', sesionVersion: { increment: 1 } },
    });
    expect(tx.tokenRefresco.updateMany).toHaveBeenCalledWith({
      where: { idUsuario: 9, revocadoEn: null },
      data: { revocadoEn: expect.any(Date) },
    });
    expect(prisma.horasParticipacion.deleteMany).not.toHaveBeenCalled();
    expect(prisma.participacionProyecto.deleteMany).not.toHaveBeenCalled();
    expect(prisma.participacionProyecto.updateMany).not.toHaveBeenCalled();
    expect(eventos.record).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'USER_STATUS_CHANGED', idActor: 1, idUsuarioAfectado: 9 }),
    );
    expect(emitter.emit).toHaveBeenCalled();
    expect(notifications.notifyFromTemplate).toHaveBeenCalledWith(
      [9],
      'DESACTIVACION_RESUELTA',
      expect.objectContaining({ aprobada: true }),
    );
    expect(r.estado).toBe('APROBADA');
  });

  it('rechazar no toca la cuenta y notifica con el comentario', async () => {
    const { servicio, prisma, tx, notifications } = setup();

    await servicio.rechazar(1, 5, 'Aun tienes horas pendientes');

    expect(prisma.solicitudDesactivacion.updateMany).toHaveBeenCalledWith({
      where: { idSolicitud: 5, estado: 'PENDIENTE' },
      data: expect.objectContaining({ estado: 'RECHAZADA', resueltaPor: 1 }),
    });
    expect(tx.usuario.update).not.toHaveBeenCalled();
    expect(notifications.notifyFromTemplate).toHaveBeenCalledWith([9], 'DESACTIVACION_RESUELTA', {
      aprobada: false,
      comentario: 'Aun tienes horas pendientes',
    });
  });

  it('un no administrador (p. ej. coordinador) recibe 403 al aprobar, rechazar o listar', async () => {
    const { servicio, prisma, tx } = setup({ admins: [1] });

    await expect(servicio.aprobar(2, 5)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(servicio.rechazar(2, 5)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(servicio.listarPendientes(2)).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.usuario.update).not.toHaveBeenCalled();
    expect(prisma.solicitudDesactivacion.updateMany).not.toHaveBeenCalled();
  });

  it('una solicitud ya resuelta responde 409', async () => {
    const { servicio } = setup({ existente: solicitud({ estado: 'APROBADA' }) });

    await expect(servicio.aprobar(1, 5)).rejects.toBeInstanceOf(ConflictException);
    await expect(servicio.rechazar(1, 5)).rejects.toBeInstanceOf(ConflictException);
  });

  it('si otra resolucion gana la carrera, la transaccion falla sin desactivar la cuenta', async () => {
    const { servicio, tx } = setup();
    tx.solicitudDesactivacion.updateMany.mockResolvedValue({ count: 0 });

    await expect(servicio.aprobar(1, 5)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.usuario.update).not.toHaveBeenCalled();
  });

  it('no desactiva a quien ya es administrador', async () => {
    const { servicio, tx } = setup({ admins: [1, 9] });

    await expect(servicio.aprobar(1, 5)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.usuario.update).not.toHaveBeenCalled();
  });
});
