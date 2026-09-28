import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { describe, expect, it, vi } from 'vitest';
import type { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { NotificationsService } from '../src/notifications/notifications.service';
import { AuthService } from '../src/auth/auth.service';
import { AccountAttemptsService } from '../src/auth/account-attempts.service';
import { SecurityEventsService } from '../src/security-events/security-events.service';
import { accountReference } from '../src/security-events/account-reference';

/**
 * G05-C04 · OWASP25-C037. El login registra exactamente un LOGIN_SUCCEEDED o
 * un LOGIN_FAILED tras conocer el resultado real. Una cuenta inexistente se
 * identifica con una referencia seudónima (nunca el correo) y ningún evento
 * contiene la contraseña. Si el writer falla, la respuesta de login es la
 * misma de siempre.
 */

process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

const CORREO = 'ana@uvg.edu.gt';
const PASSWORD = 'Correcta123';
const HASH = bcrypt.hashSync(PASSWORD, 4);

function setup(options: { writerFails?: boolean; estado?: string } = {}) {
  const create = options.writerFails ? vi.fn().mockRejectedValue(new Error('db caída')) : vi.fn().mockResolvedValue({});
  const prisma = {
    usuario: {
      findUnique: vi.fn(async ({ where }: { where: { correo: string } }) =>
        where.correo === CORREO ? { idUsuario: 3, correo: CORREO, contrasena: HASH, estado: options.estado ?? 'ACTIVO' } : null,
      ),
      update: vi.fn().mockResolvedValue({}),
    },
    tokenRefresco: { create: vi.fn().mockResolvedValue({}) },
    bitacoraAuditoria: { create },
  };
  const events = new SecurityEventsService(prisma as unknown as PrismaService);
  vi.spyOn((events as unknown as { logger: { warn: () => void } }).logger, 'warn').mockImplementation(() => undefined);
  const service = new AuthService(
    prisma as unknown as PrismaService,
    { sign: vi.fn().mockReturnValue('jwt') } as unknown as JwtService,
    {} as NotificationsService,
    new AccountAttemptsService(),
    undefined,
    events,
  );
  const rows = () => create.mock.calls.map((call) => call[0].data);
  return { service, rows, create };
}

async function outcome(promise: Promise<unknown>) {
  return promise.then(
    (value) => ({ ok: true, value }),
    (error: unknown) => ({ ok: false, status: (error as UnauthorizedException).getStatus(), body: (error as UnauthorizedException).getResponse() }),
  );
}

describe('G05-C04: eventos de resultado de autenticación', () => {
  it('login exitoso → exactamente un LOGIN_SUCCEEDED con actor y cuenta', async () => {
    const { service, rows } = setup();
    await service.login({ correo: CORREO, contrasena: PASSWORD });
    expect(rows()).toEqual([
      expect.objectContaining({ accion: 'LOGIN_SUCCEEDED', idUsuario: 3, idObjeto: '3', tipoObjeto: 'SEGURIDAD_CUENTA' }),
    ]);
  });

  it('contraseña incorrecta → exactamente un LOGIN_FAILED (CREDENCIALES) sin la contraseña', async () => {
    const { service, rows } = setup();
    await expect(service.login({ correo: CORREO, contrasena: 'Intento-Malo-1' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(rows()).toEqual([
      expect.objectContaining({
        accion: 'LOGIN_FAILED',
        idUsuario: null,
        idObjeto: '3',
        detalleJson: { motivo: 'CREDENCIALES', cuentaConocida: true },
      }),
    ]);
    expect(JSON.stringify(rows())).not.toContain('Intento-Malo-1');
  });

  it('cuenta inexistente → LOGIN_FAILED con referencia seudónima estable, nunca el correo', async () => {
    const { service, rows } = setup();
    await expect(service.login({ correo: 'Nadie@UVG.edu.gt', contrasena: 'x' })).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.login({ correo: ' nadie@uvg.edu.gt ', contrasena: 'x' })).rejects.toBeInstanceOf(UnauthorizedException);
    const [primero, segundo] = rows();
    expect(primero.detalleJson).toEqual({ motivo: 'CREDENCIALES', cuentaConocida: false, cuentaRef: expect.stringMatching(/^[0-9a-f]{16}$/) });
    expect(segundo.detalleJson.cuentaRef).toBe(primero.detalleJson.cuentaRef);
    expect(primero.detalleJson.cuentaRef).toBe(accountReference('nadie@uvg.edu.gt'));
    expect(primero.idObjeto).toBeNull();
    expect(JSON.stringify(rows()).toLowerCase()).not.toContain('nadie');
  });

  it('cuenta BLOQUEADO con contraseña correcta → LOGIN_FAILED (CUENTA_NO_ACTIVA)', async () => {
    const { service, rows } = setup({ estado: 'BLOQUEADO' });
    await expect(service.login({ correo: CORREO, contrasena: PASSWORD })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(rows().map((row) => [row.accion, row.detalleJson.motivo])).toEqual([['LOGIN_FAILED', 'CUENTA_NO_ACTIVA']]);
  });

  it('si el writer falla, el resultado del login no cambia (éxito y fallo)', async () => {
    const normal = setup();
    const caido = setup({ writerFails: true });

    expect(await outcome(caido.service.login({ correo: CORREO, contrasena: PASSWORD }))).toEqual(
      await outcome(normal.service.login({ correo: CORREO, contrasena: PASSWORD })),
    );
    expect(await outcome(caido.service.login({ correo: CORREO, contrasena: 'mala' }))).toEqual(
      await outcome(normal.service.login({ correo: CORREO, contrasena: 'mala' })),
    );
    expect(caido.create).toHaveBeenCalledTimes(2);
  });

  it('la referencia seudónima no es un hash directo del correo (HMAC con clave derivada)', async () => {
    const { createHash } = await import('node:crypto');
    const ref = accountReference('nadie@uvg.edu.gt');
    expect(ref).not.toBe(createHash('sha256').update('nadie@uvg.edu.gt').digest('hex').slice(0, 16));
  });
});
