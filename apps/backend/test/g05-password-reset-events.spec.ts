import { BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { NotificationsService } from '../src/notifications/notifications.service';
import { AdminService } from '../src/admin/admin.service';
import { AuthService } from '../src/auth/auth.service';

/**
 * G05-C06 · OWASP25-C037. La emisión privilegiada de un enlace de reset
 * (admin) y el reset completado (usuario) dejan un evento cada uno, con IDs
 * mínimos: nunca el token, la URL ni la contraseña. Un reset fallido o
 * reutilizado no se registra como completado.
 */

process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

const jwt = new JwtService({ secret: 'test-secret-para-reset-g05-0000000000' });

describe('G05-C06: eventos de recuperación de contraseña', () => {
  it('admin emite el enlace → exactamente un PASSWORD_RESET_ISSUED sin token ni URL', async () => {
    const create = vi.fn().mockResolvedValue({});
    const prisma = {
      usuarioRolAcceso: { findFirst: vi.fn().mockResolvedValue({ idUsuario: 1 }) },
      solicitudRecuperacion: {
        findUnique: vi.fn().mockResolvedValue({ idSolicitud: 9, estado: 'PENDIENTE', usuario: { idUsuario: 5, correo: 'e@uvg.edu.gt' } }),
        update: vi.fn().mockResolvedValue({}),
      },
      bitacoraAuditoria: { create },
    };
    const admin = new AdminService(prisma as unknown as PrismaService, jwt);

    const { resetToken, resetUrl, expiraEn } = await admin.generarEnlaceRecuperacion(1, 9);

    expect(create).toHaveBeenCalledTimes(1);
    const row = create.mock.calls[0][0].data;
    expect(row).toMatchObject({ accion: 'PASSWORD_RESET_ISSUED', idUsuario: 1, idObjeto: '5', detalleJson: { idSolicitud: 9, expiraEn } });
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain(resetToken);
    expect(serialized).not.toContain(resetUrl);
    expect(serialized).not.toMatch(/reset-password|token=/);
  });

  function authWith(consumidas: number) {
    const create = vi.fn().mockResolvedValue({});
    const tx = {
      solicitudRecuperacion: { updateMany: vi.fn().mockResolvedValue({ count: consumidas }) },
      usuario: { update: vi.fn().mockResolvedValue({}) },
      tokenRefresco: { updateMany: vi.fn().mockResolvedValue({ count: 3 }) },
    };
    const prisma = {
      usuario: { findUnique: vi.fn().mockResolvedValue({ idUsuario: 5 }) },
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
      bitacoraAuditoria: { create },
    };
    const token = jwt.sign({ tipo: 'reset', idSolicitud: 9, sub: 5, correo: 'e@uvg.edu.gt' });
    const auth = new AuthService(prisma as unknown as PrismaService, jwt, {} as NotificationsService);
    return { auth, create, token };
  }

  it('reset completado → exactamente un PASSWORD_RESET_COMPLETED con sesiones revocadas, sin token ni contraseña', async () => {
    const { auth, create, token } = authWith(1);
    await auth.resetPassword(token, 'NuevaClave-G05');

    expect(create).toHaveBeenCalledTimes(1);
    const row = create.mock.calls[0][0].data;
    expect(row).toMatchObject({
      accion: 'PASSWORD_RESET_COMPLETED',
      idUsuario: 5,
      idObjeto: '5',
      detalleJson: { idSolicitud: 9, sesionesRevocadas: 3 },
    });
    expect(JSON.stringify(row)).not.toContain(token);
    expect(JSON.stringify(row)).not.toContain('NuevaClave-G05');
  });

  it('token ya consumido: falla y NO se registra como completado', async () => {
    const { auth, create, token } = authWith(0);
    await expect(auth.resetPassword(token, 'NuevaClave-G05')).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('token inválido: falla y NO se registra como completado', async () => {
    const { auth, create } = authWith(1);
    await expect(auth.resetPassword('token-basura', 'NuevaClave-G05')).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });
});
