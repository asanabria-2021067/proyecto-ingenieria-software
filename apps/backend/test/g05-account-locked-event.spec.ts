import * as bcrypt from 'bcryptjs';
import { describe, expect, it, vi } from 'vitest';
import type { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { NotificationsService } from '../src/notifications/notifications.service';
import { AuthService } from '../src/auth/auth.service';
import { AccountAttemptsService, DEFAULT_ATTEMPT_POLICY } from '../src/auth/account-attempts.service';
import { SecurityEventsService } from '../src/security-events/security-events.service';

/**
 * G05-C05 · OWASP25-C037/C036. ACCOUNT_LOCKED se registra solo al CRUZAR al
 * bloqueo temporal: los intentos durante el bloqueo no generan más eventos de
 * bloqueo (sin amplificación de escrituras) y un nuevo ciclo tras caducar
 * puede producir otro evento legítimo.
 */

process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

const MIN = 60_000;
const CORREO = 'ana@uvg.edu.gt';
const PASSWORD = 'Correcta123';

function setup() {
  let now = 1_000_000;
  const create = vi.fn().mockResolvedValue({});
  const prisma = {
    usuario: {
      findUnique: vi.fn(async ({ where }: { where: { correo: string } }) =>
        where.correo.toLowerCase() === CORREO
          ? { idUsuario: 3, correo: CORREO, contrasena: bcrypt.hashSync(PASSWORD, 4), estado: 'ACTIVO' }
          : null,
      ),
      update: vi.fn().mockResolvedValue({}),
    },
    tokenRefresco: { create: vi.fn().mockResolvedValue({}) },
    bitacoraAuditoria: { create },
  };
  const service = new AuthService(
    prisma as unknown as PrismaService,
    { sign: vi.fn().mockReturnValue('jwt') } as unknown as JwtService,
    {} as NotificationsService,
    new AccountAttemptsService(DEFAULT_ATTEMPT_POLICY, new Map(), () => now),
    undefined,
    new SecurityEventsService(prisma as unknown as PrismaService),
  );
  const fail = (correo = CORREO) => service.login({ correo, contrasena: 'Clave-Equivocada-9' }).catch(() => undefined);
  const count = (accion: string) => create.mock.calls.filter((call) => call[0].data.accion === accion).length;
  return { fail, count, create, advance: (ms: number) => (now += ms), service };
}

describe('G05-C05: un ACCOUNT_LOCKED por transición', () => {
  it('4 fallos → 0; el quinto → 1; los intentos durante el bloqueo no suman eventos de bloqueo', async () => {
    const { fail, count, service } = setup();
    for (let i = 0; i < 4; i += 1) {
      await fail();
    }
    expect(count('ACCOUNT_LOCKED')).toBe(0);

    await fail();
    expect(count('ACCOUNT_LOCKED')).toBe(1);

    for (let i = 0; i < 10; i += 1) {
      await fail();
    }
    await service.login({ correo: CORREO, contrasena: PASSWORD }).catch(() => undefined);
    expect(count('ACCOUNT_LOCKED')).toBe(1);
    // Cada intento sigue siendo un LOGIN_FAILED (1 por petición, no una tormenta).
    expect(count('LOGIN_FAILED')).toBe(16);
  });

  it('tras caducar el bloqueo, un nuevo ciclo de 5 fallos produce otro evento legítimo', async () => {
    const { fail, count, advance } = setup();
    for (let i = 0; i < 5; i += 1) {
      await fail();
    }
    advance(15 * MIN);
    for (let i = 0; i < 5; i += 1) {
      await fail();
    }
    expect(count('ACCOUNT_LOCKED')).toBe(2);
  });

  it('el evento identifica la cuenta sin credenciales; una cuenta inexistente solo con referencia seudónima', async () => {
    const { fail, create } = setup();
    for (let i = 0; i < 5; i += 1) {
      await fail();
      await fail('nadie@uvg.edu.gt');
    }
    const locks = create.mock.calls.map((call) => call[0].data).filter((data) => data.accion === 'ACCOUNT_LOCKED');
    expect(locks).toEqual([
      expect.objectContaining({ idObjeto: '3', detalleJson: { cuentaConocida: true } }),
      expect.objectContaining({ idObjeto: null, detalleJson: { cuentaConocida: false, cuentaRef: expect.stringMatching(/^[0-9a-f]{16}$/) } }),
    ]);
    expect(JSON.stringify(locks)).not.toMatch(/Clave-Equivocada|nadie@/);
  });

  it('recordFailure solo devuelve true en la llamada que cruza al bloqueo', () => {
    const store = new AccountAttemptsService(DEFAULT_ATTEMPT_POLICY, new Map(), () => 0);
    const results = Array.from({ length: 7 }, () => store.recordFailure('k'));
    expect(results).toEqual([false, false, false, false, true, false, false]);
  });
});
