import { Logger } from '@nestjs/common';

/**
 * Validador único y puro de environment (06 v2 §51.1 y §51.2). Conserva las
 * validaciones vigentes del backend, devuelve configuración tipada y deriva
 * la disponibilidad de la superficie Closure a partir de las credenciales
 * Cloudinary, el conjunto de KEKs, la clave activa y el HMAC independiente de
 * tickets. Sin I/O al proveedor ni a la base de datos.
 *
 * Las variables crudas atraviesan el validador sin cambios porque
 * ConfigModule las entrega a ConfigService y a process.env a partir de este
 * retorno; las secciones derivadas (`app`, `closure`) y cualquier mensaje de
 * diagnóstico solo contienen nombres de variables y códigos de motivo, nunca
 * valores ni material de clave. Con secretos de Closure ausentes o inválidos
 * el resto del backend puede arrancar: la superficie queda marcada como no
 * disponible en lugar de fallar el arranque o inventar secretos.
 */

export const CLOSURE_DEFAULT_PREFIX = 'uvgenius/cierre';
export const CLOSURE_DELIVERY_MODES = ['authenticated', 'private', 'upload'] as const;
export type ClosureDeliveryMode = (typeof CLOSURE_DELIVERY_MODES)[number];
export const CLOSURE_DEFAULT_DELIVERY_MODE: ClosureDeliveryMode = 'authenticated';
export const CLOSURE_KEK_BYTES = 32;
export const CLOSURE_HMAC_MIN_BYTES = 32;

export const CLOSURE_REQUIRED_VARIABLES = [
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'CLOSURE_KEKS',
  'CLOSURE_ACTIVE_KEY_ID',
  'CLOSURE_TICKET_HMAC_SECRET',
] as const;
export type ClosureRequiredVariable = (typeof CLOSURE_REQUIRED_VARIABLES)[number];

export type ClosureUnavailabilityReason =
  | 'CLOUDINARY_CLOUD_NAME_INVALIDO'
  | 'CLOUDINARY_API_KEY_INVALIDO'
  | 'CLOSURE_KEKS_INVALIDO'
  | 'ACTIVE_KEY_ID_NO_EN_KEKS'
  | 'HMAC_INVALIDO'
  | 'HMAC_NO_INDEPENDIENTE'
  | 'PREFIX_INVALIDO'
  | 'DELIVERY_MODE_INVALIDO';

export interface ClosureAvailability {
  /** Documentos y operaciones de cierre que requieren storage pueden usarse. */
  disponible: boolean;
  /** Nombres de variables obligatorias ausentes o vacías. */
  faltantes: ClosureRequiredVariable[];
  /** Códigos de motivo de valores presentes pero inválidos. */
  motivos: ClosureUnavailabilityReason[];
  cloudName: string | null;
  prefix: string;
  deliveryMode: ClosureDeliveryMode;
  activeKeyId: string | null;
  /** Identificadores de KEK, nunca su material. */
  keyIds: string[];
}

export interface RedisEnvironment {
  host: string;
  port: number;
}

export interface AppEnvironment {
  nodeEnv: string;
  port: number;
  frontendUrl: string;
  cookieSecure: boolean;
  redis: RedisEnvironment;
}

export interface ValidatedEnvironment extends Record<string, unknown> {
  app: AppEnvironment;
  closure: ClosureAvailability;
}

export type RawEnvironment = Record<string, unknown>;

const logger = new Logger('EnvironmentValidation');

function readString(raw: RawEnvironment, name: string): string | undefined {
  const value = raw[name];
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Regla vigente de FRONTEND_URL, con los mismos mensajes que
 * `getRequiredFrontendUrl`: URL absoluta http/https, no vacía y distinta de '*'.
 */
export function assertFrontendUrl(value: string | undefined): string {
  const trimmed = value?.trim();

  if (!trimmed) {
    throw new Error('FRONTEND_URL environment variable is required');
  }

  if (trimmed === '*') {
    throw new Error('FRONTEND_URL cannot allow every origin');
  }

  const parsedUrl = new URL(trimmed);

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error('FRONTEND_URL must use http or https');
  }

  return trimmed;
}

function parsePort(raw: RawEnvironment, name: string, fallback: number): number {
  const value = readString(raw, name);
  if (value === undefined) {
    return fallback;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535`);
  }
  return port;
}

function deriveAppEnvironment(raw: RawEnvironment): AppEnvironment {
  return {
    nodeEnv: readString(raw, 'NODE_ENV') ?? 'development',
    port: parsePort(raw, 'PORT', 3001),
    frontendUrl: assertFrontendUrl(readString(raw, 'FRONTEND_URL')),
    cookieSecure: readString(raw, 'COOKIE_SECURE') === 'true',
    redis: {
      host: readString(raw, 'REDIS_HOST') ?? 'localhost',
      port: parsePort(raw, 'REDIS_PORT', 6379),
    },
  };
}

function decodeCanonicalBase64(value: string): Buffer | null {
  if (value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    return null;
  }
  const bytes = Buffer.from(value, 'base64');
  return bytes.toString('base64') === value ? bytes : null;
}

function parseKeks(value: string): Map<string, Buffer> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0) {
    return null;
  }
  const keys = new Map<string, Buffer>();
  for (const [keyId, material] of entries) {
    if (keyId.trim().length === 0 || typeof material !== 'string') {
      return null;
    }
    const bytes = decodeCanonicalBase64(material);
    if (bytes === null || bytes.length !== CLOSURE_KEK_BYTES) {
      return null;
    }
    keys.set(keyId, bytes);
  }
  return keys;
}

function isDeliveryMode(value: string): value is ClosureDeliveryMode {
  return (CLOSURE_DELIVERY_MODES as readonly string[]).includes(value);
}

function deriveClosureAvailability(raw: RawEnvironment): ClosureAvailability {
  const faltantes = CLOSURE_REQUIRED_VARIABLES.filter((name) => readString(raw, name) === undefined);
  const motivos: ClosureUnavailabilityReason[] = [];

  const cloudName = readString(raw, 'CLOUDINARY_CLOUD_NAME') ?? null;
  if (cloudName !== null && !/^[A-Za-z0-9_-]+$/.test(cloudName)) {
    motivos.push('CLOUDINARY_CLOUD_NAME_INVALIDO');
  }

  const apiKey = readString(raw, 'CLOUDINARY_API_KEY');
  if (apiKey !== undefined && !/^[0-9]+$/.test(apiKey)) {
    motivos.push('CLOUDINARY_API_KEY_INVALIDO');
  }

  const prefixValue = readString(raw, 'CLOSURE_CLOUDINARY_PREFIX');
  if (prefixValue !== undefined && prefixValue !== CLOSURE_DEFAULT_PREFIX) {
    motivos.push('PREFIX_INVALIDO');
  }

  const deliveryModeValue = readString(raw, 'CLOSURE_CLOUDINARY_DELIVERY_MODE');
  let deliveryMode: ClosureDeliveryMode = CLOSURE_DEFAULT_DELIVERY_MODE;
  if (deliveryModeValue !== undefined) {
    if (isDeliveryMode(deliveryModeValue)) {
      deliveryMode = deliveryModeValue;
    } else {
      motivos.push('DELIVERY_MODE_INVALIDO');
    }
  }

  const keksValue = readString(raw, 'CLOSURE_KEKS');
  const keks = keksValue === undefined ? null : parseKeks(keksValue);
  if (keksValue !== undefined && keks === null) {
    motivos.push('CLOSURE_KEKS_INVALIDO');
  }

  const activeKeyId = readString(raw, 'CLOSURE_ACTIVE_KEY_ID') ?? null;
  if (activeKeyId !== null && keks !== null && !keks.has(activeKeyId)) {
    motivos.push('ACTIVE_KEY_ID_NO_EN_KEKS');
  }

  const hmacValue = readString(raw, 'CLOSURE_TICKET_HMAC_SECRET');
  if (hmacValue !== undefined) {
    const hmac = decodeCanonicalBase64(hmacValue);
    if (hmac === null || hmac.length < CLOSURE_HMAC_MIN_BYTES) {
      motivos.push('HMAC_INVALIDO');
    } else if (keks !== null && [...keks.values()].some((kek) => kek.equals(hmac))) {
      motivos.push('HMAC_NO_INDEPENDIENTE');
    }
  }

  return {
    disponible: faltantes.length === 0 && motivos.length === 0,
    faltantes,
    motivos,
    cloudName,
    prefix: CLOSURE_DEFAULT_PREFIX,
    deliveryMode,
    activeKeyId,
    keyIds: keks === null ? [] : [...keks.keys()],
  };
}

export function validateEnvironment(raw: RawEnvironment): ValidatedEnvironment {
  const app = deriveAppEnvironment(raw);
  const closure = deriveClosureAvailability(raw);

  if (!closure.disponible) {
    logger.warn(
      `Closure storage no disponible: faltantes=[${closure.faltantes.join(', ')}] ` +
        `motivos=[${closure.motivos.join(', ')}]`,
    );
  }

  return { ...raw, app, closure };
}
