import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { AuthModule } from '../src/auth/auth.module';
import {
  AccountAttemptsService,
  DEFAULT_ATTEMPT_POLICY,
  type AttemptBackingStore,
} from '../src/auth/account-attempts.service';

/**
 * G04-C05 · OWASP25-C036. Almacén de intentos por cuenta: cuenta fallos en
 * una ventana, bloquea temporalmente, caduca solo, se limpia con un éxito,
 * está acotado en memoria y es FAIL-OPEN (un fallo interno nunca lanza ni
 * bloquea a nadie).
 */

const MIN = 60_000;

function clock(start = 1_000_000) {
  let current = start;
  return { now: () => current, advance: (ms: number) => (current += ms) };
}

function service(policy = DEFAULT_ATTEMPT_POLICY) {
  const time = clock();
  return { time, store: new AccountAttemptsService(policy, new Map(), time.now) };
}

describe('G04-C05: almacén fail-open de intentos por cuenta', () => {
  it('la política base es 5 fallos en 15 min con bloqueo de 15 min', () => {
    expect(DEFAULT_ATTEMPT_POLICY).toMatchObject({ maxFailures: 5, windowMs: 15 * MIN, lockMs: 15 * MIN });
  });

  it('bloquea al llegar al umbral dentro de la ventana y el bloqueo caduca solo', () => {
    const { time, store } = service();
    for (let i = 0; i < 4; i += 1) {
      store.recordFailure('cuenta');
      expect(store.lockedUntil('cuenta')).toBeNull();
    }
    store.recordFailure('cuenta');
    expect(store.lockedUntil('cuenta')).toBe(time.now() + 15 * MIN);

    time.advance(15 * MIN - 1);
    expect(store.lockedUntil('cuenta')).not.toBeNull();
    time.advance(1);
    expect(store.lockedUntil('cuenta')).toBeNull();
    // Tras caducar, el contador empieza de cero.
    store.recordFailure('cuenta');
    expect(store.lockedUntil('cuenta')).toBeNull();
  });

  it('los fallos fuera de la ventana no se acumulan', () => {
    const { time, store } = service();
    for (let i = 0; i < 4; i += 1) {
      store.recordFailure('cuenta');
    }
    time.advance(15 * MIN);
    store.recordFailure('cuenta');
    expect(store.lockedUntil('cuenta')).toBeNull();
  });

  it('un fallo durante el bloqueo no lo extiende', () => {
    const { time, store } = service();
    for (let i = 0; i < 5; i += 1) {
      store.recordFailure('cuenta');
    }
    const hasta = store.lockedUntil('cuenta');
    time.advance(MIN);
    store.recordFailure('cuenta');
    expect(store.lockedUntil('cuenta')).toBe(hasta);
  });

  it('un éxito limpia el contador; las cuentas son independientes', () => {
    const { store } = service();
    for (let i = 0; i < 4; i += 1) {
      store.recordFailure('a');
      store.recordFailure('b');
    }
    store.recordSuccess('a');
    store.recordFailure('a');
    store.recordFailure('b');
    expect(store.lockedUntil('a')).toBeNull();
    expect(store.lockedUntil('b')).not.toBeNull();
  });

  it('está acotado: nunca guarda más de maxEntries cuentas', () => {
    const backing = new Map();
    const time = clock();
    const store = new AccountAttemptsService({ ...DEFAULT_ATTEMPT_POLICY, maxEntries: 3 }, backing, time.now);
    for (const key of ['a', 'b', 'c', 'd', 'e']) {
      store.recordFailure(key);
    }
    expect(backing.size).toBe(3);
    expect([...backing.keys()]).toEqual(['c', 'd', 'e']);
  });

  it('fail-open: si el almacén interno falla, no lanza y nadie queda bloqueado', () => {
    const broken: AttemptBackingStore = {
      get: () => {
        throw new Error('store roto');
      },
      set: () => {
        throw new Error('store roto');
      },
      delete: () => {
        throw new Error('store roto');
      },
      keys: () => {
        throw new Error('store roto');
      },
      entries: () => {
        throw new Error('store roto');
      },
      size: 0,
    };
    const store = new AccountAttemptsService(DEFAULT_ATTEMPT_POLICY, broken);
    const warn = vi.spyOn((store as unknown as { logger: { warn: () => void } }).logger, 'warn').mockImplementation(() => undefined);

    expect(() => store.recordFailure('victima@uvg.edu.gt')).not.toThrow();
    expect(() => store.recordSuccess('victima@uvg.edu.gt')).not.toThrow();
    expect(store.lockedUntil('victima@uvg.edu.gt')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(3);
    // El aviso no incluye la clave de la cuenta.
    expect(JSON.stringify(warn.mock.calls)).not.toContain('victima@uvg.edu.gt');
  });

  it('AuthModule lo provee como una única instancia con la política base', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AuthModule) as Array<{
      provide?: unknown;
      useFactory?: () => unknown;
    }>;
    const provider = providers.find((entry) => entry.provide === AccountAttemptsService);
    const instance = provider?.useFactory?.() as AccountAttemptsService;
    expect(instance).toBeInstanceOf(AccountAttemptsService);
    expect((instance as unknown as { policy: unknown }).policy).toBe(DEFAULT_ATTEMPT_POLICY);
  });
});
