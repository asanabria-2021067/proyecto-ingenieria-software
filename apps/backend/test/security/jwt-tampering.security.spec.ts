import { describe, expect, it } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import * as jwt from 'jsonwebtoken';
import { JwtStrategy } from '../../src/auth/jwt.strategy';

/**
 * Seguridad — JWT expirado y manipulado (Subtarea T-XXX, HU carga/seguridad).
 *
 * Mismo secreto y misma política (`ignoreExpiration: false`) que
 * `JwtStrategy` (src/auth/jwt.strategy.ts) y que `JwtModule.register(...)`
 * en `AuthModule` (src/auth/auth.module.ts) — así la verificación aquí es
 * exactamente la que Passport-JWT ejecuta antes de invocar
 * `JwtStrategy.validate()` en cada request real. El repo no bootstrapea un
 * `Test.createTestingModule()` ni Supertest (ver nota en
 * password-recovery-admin.e2e.spec.ts: cuelga con Vitest + esbuild para
 * providers con forwardRef); por eso, igual que el resto de la suite, se
 * instancian las piezas reales a mano en vez de levantar la app completa.
 */

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

function verifyLikeJwtStrategy(token: string) {
  // Replica exacta de las opciones de passport-jwt en JwtStrategy: mismo
  // secreto, `ignoreExpiration: false`. jsonwebtoken.verify aplica además
  // el default de la librería (HS256), igual que passport-jwt/jsonwebtoken.
  return jwt.verify(token, JWT_SECRET, { ignoreExpiration: false });
}

describe('Seguridad JWT — token expirado', () => {
  const jwtService = new JwtService({ secret: JWT_SECRET });

  it('un access token ya expirado es rechazado (TokenExpiredError), no se llega a JwtStrategy.validate()', () => {
    const expired = jwtService.sign({ sub: 1, correo: 'a@uvg.edu' }, { expiresIn: '-10s' });

    expect(() => verifyLikeJwtStrategy(expired)).toThrow(jwt.TokenExpiredError);
  });

  it('un token con expiración futura pero ya vencida por el reloj del servidor también se rechaza', () => {
    const almostExpired = jwtService.sign({ sub: 1, correo: 'a@uvg.edu' }, { expiresIn: '1ms' });

    // Se espera un instante real para cruzar el límite; evita usar fake timers
    // porque jsonwebtoken lee Date.now() internamente en cada verify().
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(() => verifyLikeJwtStrategy(almostExpired)).toThrow(jwt.TokenExpiredError);
        resolve();
      }, 15);
    });
  });

  it('un token vigente (no expirado) sí pasa la verificación y JwtStrategy.validate() mapea el payload', () => {
    const valid = jwtService.sign({ sub: 1, correo: 'a@uvg.edu' }, { expiresIn: '45m' });

    const payload = verifyLikeJwtStrategy(valid) as { sub: number; correo: string };
    const strategy = new JwtStrategy();

    expect(strategy.validate(payload)).toEqual({ userId: 1, correo: 'a@uvg.edu' });
  });
});

describe('Seguridad JWT — token manipulado', () => {
  const jwtService = new JwtService({ secret: JWT_SECRET });

  it('un token firmado con un secreto distinto (forjado por un atacante) es rechazado (JsonWebTokenError)', () => {
    const forged = jwt.sign({ sub: 1, correo: 'admin@uvg.edu' }, 'secreto-del-atacante', {
      expiresIn: '45m',
    });

    expect(() => verifyLikeJwtStrategy(forged)).toThrow(jwt.JsonWebTokenError);
  });

  it('el payload alterado después de firmar (escalar sub a otro usuario) invalida la firma', () => {
    const original = jwtService.sign({ sub: 2, correo: 'victima@uvg.edu' }, { expiresIn: '45m' });
    const [header, , signature] = original.split('.');

    const tamperedPayload = Buffer.from(JSON.stringify({ sub: 1, correo: 'admin@uvg.edu' })).toString(
      'base64url',
    );
    const tampered = `${header}.${tamperedPayload}.${signature}`;

    expect(() => verifyLikeJwtStrategy(tampered)).toThrow(jwt.JsonWebTokenError);
  });

  it('un token con formato inválido (no son 3 segmentos base64url) es rechazado', () => {
    expect(() => verifyLikeJwtStrategy('esto-no-es-un-jwt')).toThrow(jwt.JsonWebTokenError);
  });

  it('rechaza un token con alg:"none" (ataque clásico de algorithm confusion / firma vacía)', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 1, correo: 'admin@uvg.edu' })).toString(
      'base64url',
    );
    const noneToken = `${header}.${payload}.`;

    expect(() => verifyLikeJwtStrategy(noneToken)).toThrow(jwt.JsonWebTokenError);
  });

  it('rechaza un token re-firmado con HS256 usando la clave pública/valor conocido como si fuera secreto (RS256->HS256 confusion), cuando el verificador exige el secreto real', () => {
    // Simula el escenario clásico: si el servidor solo verifica con el
    // secreto simétrico correcto (como hace JwtStrategy), cualquier token
    // firmado con OTRO valor -aunque el atacante lo intente pasar por
    // "confiable"- sigue sin superar la verificación.
    const attackerToken = jwt.sign({ sub: 1, correo: 'admin@uvg.edu' }, JWT_SECRET + '-no-es-el-mismo', {
      expiresIn: '45m',
    });

    expect(() => verifyLikeJwtStrategy(attackerToken)).toThrow(jwt.JsonWebTokenError);
  });
});
