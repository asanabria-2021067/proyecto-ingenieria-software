import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import type { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { NotificationsService } from '../src/notifications/notifications.service';
import { AuthService } from '../src/auth/auth.service';
import { AuthModule } from '../src/auth/auth.module';
import {
  AccountAttemptsService,
  DEFAULT_ATTEMPT_POLICY,
  RECOVERY_ATTEMPTS,
  RECOVERY_ATTEMPT_POLICY,
  type AttemptBackingStore,
} from '../src/auth/account-attempts.service';

/**
 * G04-C07 · OWASP25-C036/C014. Cada solicitud de recuperación crea un registro
 * y notifica a TODOS los administradores: una ráfaga sobre el mismo carné se
 * acota (3 por hora) sin cambiar la respuesta pública anti-enumeración.
 */

process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

const CARNE = '20231234';
const HORA = 60 * 60_000;

function setup(store?: AttemptBackingStore) {
  let now = 9_000_000;
  const prisma = {
    perfilEstudiante: {
      findUnique: vi.fn(async ({ where }: { where: { carne: string } }) =>
        where.carne.trim() === CARNE ? { usuario: { idUsuario: 2, nombre: 'Est', apellido: 'Udiante' } } : null,
      ),
    },
    solicitudRecuperacion: { create: vi.fn().mockResolvedValue({ idSolicitud: 1 }) },
  };
  const notifications = { notifyAdminsFromTemplate: vi.fn().mockResolvedValue(undefined) };
  const service = new AuthService(
    prisma as unknown as PrismaService,
    {} as JwtService,
    notifications as unknown as NotificationsService,
    new AccountAttemptsService(),
    new AccountAttemptsService(RECOVERY_ATTEMPT_POLICY, store ?? new Map(), () => now),
  );
  return { service, prisma, notifications, advance: (ms: number) => (now += ms) };
}

describe('G04-C07: recuperación acotada por cuenta', () => {
  it('una ráfaga sobre el mismo carné solo crea 3 solicitudes y 3 avisos a admins por hora', async () => {
    const { service, prisma, notifications } = setup();
    const respuestas = new Set<string>();
    for (let i = 0; i < 10; i += 1) {
      respuestas.add(JSON.stringify(await service.forgotPassword(CARNE, 'e@uvg.edu.gt')));
    }
    expect(prisma.solicitudRecuperacion.create).toHaveBeenCalledTimes(3);
    expect(notifications.notifyAdminsFromTemplate).toHaveBeenCalledTimes(3);
    // La respuesta pública no cambia al pasar el límite.
    expect(respuestas.size).toBe(1);
  });

  it('el carné se normaliza (espacios) y la cota caduca a la hora', async () => {
    const { service, prisma, advance } = setup();
    for (const variante of [CARNE, ` ${CARNE}`, `${CARNE} `, ` ${CARNE} `]) {
      await service.forgotPassword(variante, 'e@uvg.edu.gt');
    }
    expect(prisma.solicitudRecuperacion.create).toHaveBeenCalledTimes(3);

    advance(HORA);
    await service.forgotPassword(CARNE, 'e@uvg.edu.gt');
    expect(prisma.solicitudRecuperacion.create).toHaveBeenCalledTimes(4);
  });

  it('sin enumeración: carné existente, inexistente y acotado responden exactamente igual', async () => {
    const { service } = setup();
    const inexistente = await service.forgotPassword('00000000', 'x@uvg.edu.gt');
    const existente = await service.forgotPassword(CARNE, 'e@uvg.edu.gt');
    await service.forgotPassword(CARNE, 'e@uvg.edu.gt');
    await service.forgotPassword(CARNE, 'e@uvg.edu.gt');
    const acotado = await service.forgotPassword(CARNE, 'e@uvg.edu.gt');
    expect(existente).toEqual(inexistente);
    expect(acotado).toEqual(inexistente);
  });

  it('fail-open: con el almacén caído la solicitud se registra igual', async () => {
    const roto = new Proxy({} as AttemptBackingStore, {
      get: () => {
        throw new Error('almacén caído');
      },
    });
    const { service, prisma } = setup(roto);
    await service.forgotPassword(CARNE, 'e@uvg.edu.gt');
    expect(prisma.solicitudRecuperacion.create).toHaveBeenCalledTimes(1);
  });

  it('AuthModule provee una instancia de recuperación separada, con su propia política', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AuthModule) as Array<{
      provide?: unknown;
      useFactory?: () => unknown;
    }>;
    const login = providers.find((p) => p.provide === AccountAttemptsService)?.useFactory?.();
    const recovery = providers.find((p) => p.provide === RECOVERY_ATTEMPTS)?.useFactory?.();
    expect((login as { policy: unknown }).policy).toBe(DEFAULT_ATTEMPT_POLICY);
    expect((recovery as { policy: unknown }).policy).toBe(RECOVERY_ATTEMPT_POLICY);
    expect(RECOVERY_ATTEMPT_POLICY).toMatchObject({ maxFailures: 3, windowMs: HORA, lockMs: HORA });
  });
});
