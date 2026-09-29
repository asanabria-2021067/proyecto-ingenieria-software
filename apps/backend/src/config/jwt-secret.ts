import type { ConfigService } from '@nestjs/config';

/**
 * Proveedor único del secreto de firma de los access tokens (G01 ·
 * OWASP25-C019). Toda lectura de JWT_SECRET pasa por este módulo y falla
 * cerrada: si el valor está ausente, vacío, es un valor por defecto conocido o
 * tiene menos de JWT_SECRET_MIN_LENGTH caracteres, se lanza un error y el
 * backend no arranca. Los mensajes solo nombran la variable y la regla
 * incumplida; nunca incluyen el valor ni su longitud.
 */

export const JWT_SECRET_VARIABLE = 'JWT_SECRET';
export const JWT_SECRET_MIN_LENGTH = 32;

/** Valores públicos que alguna vez fueron fallback del código o del template de entorno. */
export const KNOWN_INSECURE_JWT_SECRETS: readonly string[] = [
  'dev-secret-change-me',
  'super-secret-key-change-in-production',
];

export function assertJwtSecret(value: unknown): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';

  if (trimmed.length === 0) {
    throw new Error(`${JWT_SECRET_VARIABLE} environment variable is required`);
  }

  if (KNOWN_INSECURE_JWT_SECRETS.includes(trimmed)) {
    throw new Error(`${JWT_SECRET_VARIABLE} must not use a known default value`);
  }

  if (trimmed.length < JWT_SECRET_MIN_LENGTH) {
    throw new Error(
      `${JWT_SECRET_VARIABLE} must be at least ${JWT_SECRET_MIN_LENGTH} characters long`,
    );
  }

  return value as string;
}

/**
 * Lector para consumidores que se instancian después de cargar el entorno
 * (ConfigModule ya asignó el entorno validado a process.env).
 */
export function getJwtSecret(): string {
  return assertJwtSecret(process.env[JWT_SECRET_VARIABLE]);
}

/** Lector para las factories de JwtModule, que reciben el ConfigService validado. */
export function getJwtSecretFromConfig(config: Pick<ConfigService, 'get'>): string {
  return assertJwtSecret(config.get<string>(JWT_SECRET_VARIABLE));
}
