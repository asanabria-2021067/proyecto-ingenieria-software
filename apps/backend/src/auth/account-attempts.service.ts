import { Logger } from '@nestjs/common';

/**
 * G04 (OWASP25-C036): almacén de intentos fallidos por cuenta, en memoria del
 * proceso y acotado.
 *
 * Se eligió memoria de proceso y no el Redis de la caché: el backend corre en
 * una sola instancia y un Redis caído o lento no debe convertirse en un
 * bloqueo general ni en un error del login. El almacén es FAIL-OPEN: si algo
 * interno falla, se registra un warning y la cuenta se trata como no
 * bloqueada; el throttler por IP sigue siendo la red de seguridad. Al
 * reiniciar el proceso los contadores se pierden, lo cual es aceptable para
 * un bloqueo temporal.
 *
 * Nunca guarda contraseñas ni datos del usuario: solo la clave de cuenta que
 * le pasa el llamador (ya normalizada) y dos números.
 */

export interface AttemptPolicy {
  /** Fallos dentro de la ventana que activan el bloqueo. */
  maxFailures: number;
  /** Ventana de conteo, en ms. */
  windowMs: number;
  /** Duración del bloqueo, en ms. */
  lockMs: number;
  /** Máximo de cuentas rastreadas a la vez (cota de memoria). */
  maxEntries: number;
}

/** Base del plan G04: 5 fallos en 15 minutos bloquean 15 minutos. */
export const DEFAULT_ATTEMPT_POLICY: AttemptPolicy = {
  maxFailures: 5,
  windowMs: 15 * 60_000,
  lockMs: 15 * 60_000,
  maxEntries: 10_000,
};

/**
 * G04 (OWASP25-C036/C014): solicitudes de recuperación por carné. Cada una
 * crea un registro y notifica a TODOS los administradores; después de 3 en
 * una hora, las siguientes se descartan en silencio durante una hora.
 */
export const RECOVERY_ATTEMPT_POLICY: AttemptPolicy = {
  maxFailures: 3,
  windowMs: 60 * 60_000,
  lockMs: 60 * 60_000,
  maxEntries: 10_000,
};

/** Token de inyección de la instancia dedicada a recuperación (otra política que login). */
export const RECOVERY_ATTEMPTS = Symbol('RECOVERY_ATTEMPTS');

interface AttemptEntry {
  failures: number;
  windowStart: number;
  lockedUntil: number;
}

/** Subconjunto de Map que usa el almacén; permite inyectar uno que falle en tests. */
export type AttemptBackingStore = Pick<Map<string, AttemptEntry>, 'get' | 'set' | 'delete' | 'keys' | 'entries'> & {
  readonly size: number;
};

/**
 * Se registra en AuthModule con `useFactory` (sus parámetros tienen defaults
 * y no son providers de Nest).
 */
export class AccountAttemptsService {
  private readonly logger = new Logger(AccountAttemptsService.name);

  constructor(
    private readonly policy: AttemptPolicy = DEFAULT_ATTEMPT_POLICY,
    private readonly store: AttemptBackingStore = new Map<string, AttemptEntry>(),
    private readonly now: () => number = Date.now,
  ) {}

  /** Momento (ms epoch) hasta el que la cuenta está bloqueada, o null. Fail-open. */
  lockedUntil(key: string): number | null {
    return this.failOpen('lockedUntil', null, () => {
      const entry = this.store.get(key);
      if (!entry) {
        return null;
      }
      const now = this.now();
      if (entry.lockedUntil > now) {
        return entry.lockedUntil;
      }
      if (entry.lockedUntil !== 0 || now - entry.windowStart >= this.policy.windowMs) {
        this.store.delete(key);
      }
      return null;
    });
  }

  /**
   * Suma un fallo; al llegar al umbral dentro de la ventana, bloquea. Fail-open.
   * Devuelve true SOLO en la llamada que hace cruzar la cuenta al bloqueo
   * (G05: un evento ACCOUNT_LOCKED por transición, nunca uno por intento).
   */
  recordFailure(key: string): boolean {
    return this.failOpen('recordFailure', false, () => {
      const now = this.now();
      const current = this.store.get(key);
      if (current && current.lockedUntil > now) {
        return false;
      }
      const expired = !current || current.lockedUntil !== 0 || now - current.windowStart >= this.policy.windowMs;
      const entry = expired ? { failures: 0, windowStart: now, lockedUntil: 0 } : current;
      entry.failures += 1;
      const lockedNow = entry.failures >= this.policy.maxFailures;
      if (lockedNow) {
        entry.lockedUntil = now + this.policy.lockMs;
      }
      this.store.delete(key);
      this.store.set(key, entry);
      this.evict(now);
      return lockedNow;
    });
  }

  /** Un éxito limpia el contador de la cuenta. Fail-open. */
  recordSuccess(key: string): void {
    this.failOpen('recordSuccess', undefined, () => {
      this.store.delete(key);
    });
  }

  /** Mantiene el almacén bajo `maxEntries`: primero caducadas, luego las más antiguas. */
  private evict(now: number): void {
    if (this.store.size <= this.policy.maxEntries) {
      return;
    }
    for (const [key, entry] of this.store.entries()) {
      if (entry.lockedUntil <= now && now - entry.windowStart >= this.policy.windowMs) {
        this.store.delete(key);
      }
    }
    for (const key of this.store.keys()) {
      if (this.store.size <= this.policy.maxEntries) {
        break;
      }
      this.store.delete(key);
    }
  }

  private failOpen<T>(operation: string, fallback: T, action: () => T): T {
    try {
      return action();
    } catch (error) {
      this.logger.warn(`Almacén de intentos no disponible (${operation}): ${(error as Error).name}; se continúa sin bloqueo por cuenta`);
      return fallback;
    }
  }
}
