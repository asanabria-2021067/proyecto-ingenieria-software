import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  AuditInterceptor,
  REDACTED,
  isSensitiveAuditKey,
  redactAuditValue,
} from '../src/common/interceptors/audit.interceptor';

/**
 * G05-C01 · OWASP25-C026. La redacción del detalle de auditoría es recursiva
 * (objetos, arrays, arrays de objetos) y compara claves normalizadas
 * (mayúsculas, acentos, guiones/guiones bajos). Nunca conserva el valor
 * original ni un hash suyo.
 */

const SECRETOS = ['Clave-Secreta-1', 'jwt.header.payload', 'reset-token-xyz', 'https://app/reset-password?token=abc', 'sk_live_123'];

function leaks(value: unknown): string[] {
  const text = JSON.stringify(value);
  return SECRETOS.filter((secret) => text.includes(secret));
}

describe('G05-C01: redacción recursiva y case-insensitive', () => {
  it.each([
    'password',
    'PASSWORD',
    'contrasena',
    'Contraseña',
    'nuevaContrasena',
    'NUEVA_CONTRASEÑA',
    'currentPassword',
    'token',
    'refreshToken',
    'resetToken',
    'tokenHash',
    'resetUrl',
    'clientSecret',
    'JWT_SECRET',
    'Authorization',
    'x-api-key',
    'set-cookie',
    'privateKey',
    'credentials',
    'credencialesAcceso',
  ])('%s se considera sensible', (key) => {
    expect(isSensitiveAuditKey(key)).toBe(true);
  });

  it.each(['correo', 'nombre', 'estado', 'idProyecto', 'mensaje', 'descripcion', 'clave'])('%s no se redacta', (key) => {
    expect(isSensitiveAuditKey(key)).toBe(false);
  });

  it('objeto plano, anidado, arrays y arrays de objetos', () => {
    const input = {
      correo: 'a@uvg.edu.gt',
      Contraseña: SECRETOS[0],
      perfil: { cuenta: { refreshToken: SECRETOS[1], nombre: 'Ana' } },
      sesiones: [{ token: SECRETOS[1] }, { id: 2, nested: [{ resetToken: SECRETOS[2] }] }],
      lista: ['visible', { resetUrl: SECRETOS[3] }],
      config: { API_KEY: SECRETOS[4] },
    };

    const output = redactAuditValue(input);

    expect(leaks(output)).toEqual([]);
    expect(output).toEqual({
      correo: 'a@uvg.edu.gt',
      Contraseña: REDACTED,
      perfil: { cuenta: { refreshToken: REDACTED, nombre: 'Ana' } },
      sesiones: [{ token: REDACTED }, { id: 2, nested: [{ resetToken: REDACTED }] }],
      lista: ['visible', { resetUrl: REDACTED }],
      config: { API_KEY: REDACTED },
    });
    // El original no se muta.
    expect(input.perfil.cuenta.refreshToken).toBe(SECRETOS[1]);
  });

  it('el marcador es fijo: no hay hash ni longitud del valor original', () => {
    const a = redactAuditValue({ password: 'corta' }) as Record<string, unknown>;
    const b = redactAuditValue({ password: 'una-contraseña-mucho-más-larga' }) as Record<string, unknown>;
    expect(a.password).toBe(REDACTED);
    expect(b.password).toBe(REDACTED);
  });

  it('ciclos y profundidad extrema no rompen ni filtran', () => {
    const cyclic: Record<string, unknown> = { token: SECRETOS[1] };
    cyclic.self = cyclic;
    expect(redactAuditValue(cyclic)).toEqual({ token: REDACTED, self: '[circular]' });

    let deep: Record<string, unknown> = { password: SECRETOS[0] };
    for (let i = 0; i < 50; i += 1) {
      deep = { nivel: deep };
    }
    expect(leaks(redactAuditValue(deep))).toEqual([]);
  });

  it('fixture negativo: la redacción anterior (solo primer nivel y claves exactas) filtraba credenciales anidadas', () => {
    const legacy = (data: Record<string, unknown>) => {
      const copy = { ...data };
      for (const field of ['contrasena', 'nuevaContrasena', 'password', 'token', 'resetToken', 'resetUrl', 'secret']) {
        if (copy[field]) {
          copy[field] = REDACTED;
        }
      }
      return copy;
    };
    const input = { Contraseña: SECRETOS[0], sesion: { refreshToken: SECRETOS[1] } };
    expect(leaks(legacy(input))).toEqual([SECRETOS[0], SECRETOS[1]]);
    expect(leaks(redactAuditValue(input))).toEqual([]);
  });

  it('AuditInterceptor persiste el body y la respuesta ya redactados', async () => {
    const create = vi.fn().mockResolvedValue({});
    const interceptor = new AuditInterceptor({ bitacoraAuditoria: { create } } as unknown as PrismaService);
    const request = {
      method: 'POST',
      url: '/api/auth/reset-password',
      user: undefined,
      ip: '127.0.0.1',
      headers: {},
      body: { token: SECRETOS[2], datos: { nuevaContraseña: SECRETOS[0] } },
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getClass: () => ({ name: 'AuthController' }),
      getHandler: () => ({ name: 'resetPassword' }),
    } as unknown as ExecutionContext;
    const handler: CallHandler = { handle: () => of({ mensaje: 'ok', sesion: { accessToken: SECRETOS[1] } }) };

    await lastValueFrom(interceptor.intercept(context, handler));
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));

    const detalle = create.mock.calls[0][0].data.detalleJson;
    expect(leaks(detalle)).toEqual([]);
    expect(detalle.body).toEqual({ token: REDACTED, datos: { nuevaContraseña: REDACTED } });
    expect(detalle.response).toEqual({ mensaje: 'ok', sesion: { accessToken: REDACTED } });
  });
});
