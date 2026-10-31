import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { describe, expect, it, vi } from 'vitest';
import type { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { NotificationsService } from '../src/notifications/notifications.service';
import type { SecurityRequestContext } from '../src/security-events/request-context';
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
        accountAttemptKey(where.correo).split('|')[0] === CORREO
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
  const login = (correo: string, contrasena: string, ip?: string) =>
    service.login({ correo, contrasena }, ip ? ({ ip } as SecurityRequestContext) : undefined);
  const outcome = async (correo: string, contrasena: string, ip?: string) =>
    login(correo, contrasena, ip).then(
      () => 'OK',
      (error: unknown) => {
        expect(error).toBeInstanceOf(UnauthorizedException);
        const { intentosRestantes: _omit, ...cuerpo } = (error as UnauthorizedException).getResponse() as Record<string, unknown>;
        return JSON.stringify(cuerpo);
      },
    );
  // NL-T1: el aviso de intentos restantes cambia con cada intento (a propósito);
  // `outcome` lo omite para seguir comparando que el resto de la respuesta es idéntico.
  const restantes = async (correo: string, contrasena: string, ip?: string) =>
    login(correo, contrasena, ip).then(
      () => null,
      (error: unknown) => ((error as UnauthorizedException).getResponse() as { intentosRestantes: number }).intentosRestantes,
    );
  return { service, prisma, login, outcome, restantes, advance: (ms: number) => (now += ms) };
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

  it('5 fallos desde la IP A no bloquean la misma cuenta desde la IP B, y desde A si', async () => {
    const { outcome } = setup();
    for (let i = 0; i < 5; i += 1) {
      expect(await outcome(CORREO, 'Incorrecta1', '10.0.0.1')).not.toBe('OK');
    }
    expect(await outcome(CORREO, PASSWORD, '10.0.0.2')).toBe('OK');
    expect(await outcome(CORREO, PASSWORD, '10.0.0.1')).not.toBe('OK');
  });

  it('sin origen (ip null) el login sigue pasando y se cuenta aparte', async () => {
    const { outcome } = setup();
    await failTimes(outcome, CORREO, 4);
    expect(await outcome(CORREO, PASSWORD)).toBe('OK');
    expect(await outcome(CORREO, PASSWORD, '10.0.0.1')).toBe('OK');
  });

  it('accountAttemptKey incluye la IP normalizando el correo', () => {
    expect(accountAttemptKey(' ANA@uvg.edu.gt ', '1.2.3.4')).toBe('ana@uvg.edu.gt|1.2.3.4');
    expect(accountAttemptKey('ana@uvg.edu.gt')).toBe('ana@uvg.edu.gt|');
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

  // NL-T1: aviso «Te quedan N intentos». El contador es correo+IP y también cuenta
  // las cuentas inexistentes, así que el número no delata si el correo existe.
  it('intentosRestantes baja igual para un correo registrado y para uno inexistente', async () => {
    const { restantes } = setup();
    const existente: (number | null)[] = [];
    const inexistente: (number | null)[] = [];
    for (let i = 0; i < 6; i += 1) {
      existente.push(await restantes(CORREO, 'Incorrecta1', '10.0.0.1'));
      inexistente.push(await restantes('nadie@uvg.edu.gt', 'Incorrecta1', '10.0.0.1'));
    }
    expect(existente).toEqual([4, 3, 2, 1, 0, 0]);
    expect(inexistente).toEqual(existente);
  });

  it('con la cuenta bloqueada la contraseña correcta recibe 0 intentos, igual que una incorrecta', async () => {
    const { restantes } = setup();
    for (let i = 0; i < 5; i += 1) await restantes(CORREO, 'Incorrecta1');
    expect(await restantes(CORREO, PASSWORD)).toBe(0);
  });

  it('el contador es por IP y vuelve al máximo tras el bloqueo', async () => {
    const { restantes, advance } = setup();
    await restantes(CORREO, 'Incorrecta1', '10.0.0.1');
    expect(await restantes(CORREO, 'Incorrecta1', '10.0.0.2')).toBe(4);
    for (let i = 0; i < 4; i += 1) await restantes(CORREO, 'Incorrecta1', '10.0.0.1');
    advance(15 * MIN);
    expect(await restantes(CORREO, 'Incorrecta1', '10.0.0.1')).toBe(4);
  });
});
