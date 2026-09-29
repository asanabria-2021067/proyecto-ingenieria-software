import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { describe, expect, it, vi } from 'vitest';
import type { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { NotificationsService } from '../src/notifications/notifications.service';
import { AuthService, accountAttemptKey } from '../src/auth/auth.service';
import {
  AccountAttemptsService,
  DEFAULT_ATTEMPT_POLICY,
  type AttemptBackingStore,
} from '../src/auth/account-attempts.service';

/**
 * G04-C06 · OWASP25-C036. Bloqueo temporal por cuenta integrado en login:
 * 5 fallos en 15 min bloquean 15 min; el bloqueo caduca; un éxito limpia el
 * contador; mayúsculas/espacios no lo evaden; y la respuesta de una cuenta
 * bloqueada es idéntica a la de credenciales inválidas (exista o no la cuenta).
 */

process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

const MIN = 60_000;
const CORREO = 'ana@uvg.edu.gt';
const PASSWORD = 'Correcta123';
const HASH = bcrypt.hashSync(PASSWORD, 4);

function setup(store?: AttemptBackingStore) {
  let now = 5_000_000;
  const attempts = new AccountAttemptsService(DEFAULT_ATTEMPT_POLICY, store ?? new Map(), () => now);
  const prisma = {
    usuario: {
      // La búsqueda en la base es exacta (como hoy); solo el contador se normaliza.
      findUnique: vi.fn(async ({ where }: { where: { correo: string } }) =>
        accountAttemptKey(where.correo) === CORREO
          ? { idUsuario: 1, correo: CORREO, contrasena: HASH, estado: 'ACTIVO' }
          : null,
      ),
      update: vi.fn().mockResolvedValue({}),
    },
    tokenRefresco: { create: vi.fn().mockResolvedValue({}) },
  };
  const service = new AuthService(
    prisma as unknown as PrismaService,
    { sign: vi.fn().mockReturnValue('jwt') } as unknown as JwtService,
    {} as NotificationsService,
    attempts,
  );
  const login = (correo: string, contrasena: string) => service.login({ correo, contrasena });
  const outcome = async (correo: string, contrasena: string) =>
    login(correo, contrasena).then(
      () => 'OK',
      (error: unknown) => {
        expect(error).toBeInstanceOf(UnauthorizedException);
        return JSON.stringify((error as UnauthorizedException).getResponse());
      },
    );
  return { service, prisma, login, outcome, advance: (ms: number) => (now += ms) };
}

async function failTimes(fn: (correo: string, pwd: string) => Promise<string>, correo: string, times: number) {
  for (let i = 0; i < times; i += 1) {
    expect(await fn(correo, 'Incorrecta1')).not.toBe('OK');
  }
}

describe('G04-C06: bloqueo temporal por cuenta en login', () => {
  it('5 fallos bloquean: la contraseña correcta se rechaza con la respuesta genérica y sin tokens', async () => {
    const { outcome, prisma } = setup();
    const generica = await outcome(CORREO, 'Incorrecta1');
    await failTimes(outcome, CORREO, 4);

    expect(await outcome(CORREO, PASSWORD)).toBe(generica);
    expect(prisma.tokenRefresco.create).not.toHaveBeenCalled();
  });

  it('el bloqueo dura 15 minutos y después la cuenta vuelve a entrar', async () => {
    const { outcome, advance } = setup();
    await failTimes(outcome, CORREO, 5);

    advance(15 * MIN - 1);
    expect(await outcome(CORREO, PASSWORD)).not.toBe('OK');
    advance(1);
    expect(await outcome(CORREO, PASSWORD)).toBe('OK');
  });

  it('un login exitoso limpia el contador', async () => {
    const { outcome } = setup();
    await failTimes(outcome, CORREO, 4);
    expect(await outcome(CORREO, PASSWORD)).toBe('OK');
    await failTimes(outcome, CORREO, 4);
    expect(await outcome(CORREO, PASSWORD)).toBe('OK');
  });

  it('mayúsculas y espacios comparten el mismo contador', async () => {
    const { outcome } = setup();
    for (const variante of ['ANA@uvg.edu.gt', ' ana@uvg.edu.gt', 'Ana@UVG.edu.gt ', 'ana@uvg.edu.gt', ' ANA@UVG.EDU.GT ']) {
      expect(await outcome(variante, 'Incorrecta1')).not.toBe('OK');
    }
    expect(await outcome(CORREO, PASSWORD)).not.toBe('OK');
  });

  it('sin enumeración: una cuenta inexistente también se bloquea y todas las respuestas son idénticas', async () => {
    const { outcome } = setup();
    const inexistente = 'nadie@uvg.edu.gt';
    const respuestas = new Set<string>();
    for (let i = 0; i < 6; i += 1) {
      respuestas.add(await outcome(inexistente, 'Incorrecta1'));
    }
    await failTimes(outcome, CORREO, 5);
    respuestas.add(await outcome(CORREO, PASSWORD));
    expect(respuestas.size).toBe(1);
  });

  it('una cuenta bloqueada sigue haciendo el mismo trabajo (búsqueda + bcrypt)', async () => {
    const { outcome, prisma } = setup();
    await failTimes(outcome, CORREO, 5);
    prisma.usuario.findUnique.mockClear();
    await outcome(CORREO, PASSWORD);
    expect(prisma.usuario.findUnique).toHaveBeenCalledTimes(1);
  });

  it('fail-open: con el almacén roto el login correcto funciona y el incorrecto no lanza otra cosa', async () => {
    const roto = new Proxy({} as AttemptBackingStore, {
      get: () => {
        throw new Error('almacén caído');
      },
    });
    const { outcome } = setup(roto);
    expect(await outcome(CORREO, 'Incorrecta1')).not.toBe('OK');
    expect(await outcome(CORREO, PASSWORD)).toBe('OK');
  });
});
