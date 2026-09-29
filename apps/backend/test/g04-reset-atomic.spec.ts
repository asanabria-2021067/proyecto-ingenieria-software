import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { NotificationsService } from '../src/notifications/notifications.service';
import { AuthService } from '../src/auth/auth.service';

/**
 * G04-C04 · OWASP25-C024. El reset consume el token con un UPDATE condicional
 * y, en la MISMA transacción, cambia la contraseña y revoca todos los refresh
 * del usuario. Si el token ya fue consumido (0 filas), no se toca nada más.
 * La carrera real contra PostgreSQL vive en password-recovery-admin.real-db.
 */

process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

function makeService(consumidas: number) {
  const tx = {
    solicitudRecuperacion: { updateMany: vi.fn().mockResolvedValue({ count: consumidas }) },
    usuario: { update: vi.fn().mockResolvedValue({}) },
    tokenRefresco: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
  };
  const prisma = {
    usuario: { findUnique: vi.fn().mockResolvedValue({ idUsuario: 9 }) },
    $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  const jwtService = { verify: vi.fn().mockReturnValue({ tipo: 'reset', idSolicitud: 4, sub: 9, correo: 'e@uvg.edu.gt' }) };
  const service = new AuthService(
    prisma as unknown as PrismaService,
    jwtService as unknown as JwtService,
    {} as NotificationsService,
  );
  return { service, prisma, tx };
}

describe('G04-C04: reset atómico con revocación de sesiones', () => {
  it('consume el token condicionalmente, cambia la contraseña y revoca los refresh en una transacción', async () => {
    const { service, prisma, tx } = makeService(1);

    await expect(service.resetPassword('token', 'NuevaClave123')).resolves.toEqual({
      mensaje: 'Contraseña actualizada exitosamente',
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.solicitudRecuperacion.updateMany).toHaveBeenCalledWith({
      where: { idSolicitud: 4, idUsuario: 9, tokenUtilizadoEn: null },
      data: { tokenUtilizadoEn: expect.any(Date) },
    });
    expect(tx.usuario.update).toHaveBeenCalledWith({ where: { idUsuario: 9 }, data: { contrasena: expect.any(String) } });
    expect(tx.tokenRefresco.updateMany).toHaveBeenCalledWith({
      where: { idUsuario: 9, revocadoEn: null },
      data: { revocadoEn: expect.any(Date) },
    });
  });

  it('token ya consumido (0 filas): falla sin cambiar la contraseña ni revocar nada', async () => {
    const { service, tx } = makeService(0);

    await expect(service.resetPassword('token', 'NuevaClave123')).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.usuario.update).not.toHaveBeenCalled();
    expect(tx.tokenRefresco.updateMany).not.toHaveBeenCalled();
  });
});
