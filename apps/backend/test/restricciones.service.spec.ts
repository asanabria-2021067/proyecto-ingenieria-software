import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { NotificationsService } from '../src/notifications/notifications.service';
import { assertSinBloqueo, hayBloqueo, MENSAJE_BLOQUEO } from '../src/common/bloqueos';
import { RestriccionesService } from '../src/perfil-portafolio/restricciones.service';

describe('MEJ-153 bloqueos y silencios', () => {
  it('hayBloqueo mira ambos sentidos y assertSinBloqueo no revela de que lado esta', async () => {
    const db = { restriccionUsuario: { findFirst: vi.fn().mockResolvedValue({ idRestriccion: 1 }) } };
    await expect(hayBloqueo(db as never, 1, 2)).resolves.toBe(true);
    expect(db.restriccionUsuario.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tipo: 'BLOQUEO', OR: [{ idUsuario: 1, idObjetivo: 2 }, { idUsuario: 2, idObjetivo: 1 }] },
      }),
    );
    await expect(assertSinBloqueo(db as never, 1, 2)).rejects.toThrow(MENSAJE_BLOQUEO);
    await expect(hayBloqueo(db as never, 3, 3)).resolves.toBe(false);
  });

  function crear() {
    const prisma = {
      usuario: { findFirst: vi.fn().mockResolvedValue({ idUsuario: 2 }) },
      restriccionUsuario: { upsert: vi.fn().mockReturnValue('upsert'), deleteMany: vi.fn().mockResolvedValue({ count: 1 }), findMany: vi.fn().mockResolvedValue([]) },
      amistad: { deleteMany: vi.fn().mockReturnValue('amistad') },
      seguimiento: { deleteMany: vi.fn().mockReturnValue('seguimiento') },
      $transaction: vi.fn().mockResolvedValue([]),
    };
    return { prisma, servicio: new RestriccionesService(prisma as never) };
  }

  it('bloquear tambien deshace amistad y seguimientos; silenciar no', async () => {
    const { prisma, servicio } = crear();
    await servicio.aplicar(1, 2, 'BLOQUEO');
    expect(prisma.$transaction).toHaveBeenLastCalledWith(['upsert', 'amistad', 'seguimiento']);
    await servicio.aplicar(1, 2, 'SILENCIO');
    expect(prisma.$transaction).toHaveBeenLastCalledWith(['upsert']);
  });

  it('no se aplica a uno mismo ni a quien el directorio no muestra', async () => {
    const { prisma, servicio } = crear();
    await expect(servicio.aplicar(1, 1, 'BLOQUEO')).rejects.toBeInstanceOf(BadRequestException);
    prisma.usuario.findFirst.mockResolvedValue(null);
    await expect(servicio.aplicar(1, 9, 'BLOQUEO')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('quitar solo toca las filas propias', async () => {
    const { prisma, servicio } = crear();
    await servicio.quitar(1, 2, 'SILENCIO');
    expect(prisma.restriccionUsuario.deleteMany).toHaveBeenCalledWith({ where: { idUsuario: 1, idObjetivo: 2, tipo: 'SILENCIO' } });
  });
});

describe('MEJ-153 silenciar oculta notificaciones', () => {
  it('quien silencio al autor no recibe su aviso; los demas si', async () => {
    const prisma = {
      preferenciaNotificacion: { findMany: vi.fn().mockResolvedValue([]) },
      restriccionUsuario: { findMany: vi.fn().mockResolvedValue([{ idUsuario: 2 }]) },
      notificacion: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    const servicio = new NotificationsService(prisma as never, { notifyUsers: vi.fn() } as never);
    await servicio.notifyUsers([2, 3], { tipoNotificacion: 'NUEVO_SEGUIDOR', tituloNotificacion: 't' }, undefined, 9);
    expect(prisma.restriccionUsuario.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { idObjetivo: 9, tipo: 'SILENCIO', idUsuario: { in: [2, 3] } } }),
    );
    expect(prisma.notificacion.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: [expect.objectContaining({ idUsuario: 3 })] }),
    );
  });

  it('sin autor no consulta silencios', async () => {
    const prisma = {
      preferenciaNotificacion: { findMany: vi.fn().mockResolvedValue([]) },
      restriccionUsuario: { findMany: vi.fn() },
      notificacion: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
    };
    const servicio = new NotificationsService(prisma as never, { notifyUsers: vi.fn() } as never);
    await servicio.notifyUsers([2, 3], { tipoNotificacion: 'NUEVO_SEGUIDOR', tituloNotificacion: 't' });
    expect(prisma.restriccionUsuario.findMany).not.toHaveBeenCalled();
  });
});
