import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * G05 (OWASP25-C026): redacción del detalle de auditoría. Recorre objetos y
 * arrays a cualquier profundidad y compara claves NORMALIZADAS (minúsculas,
 * sin acentos ni separadores): `Contraseña`, `NUEVA_CONTRASENA`,
 * `refreshToken` o `x-api-key` se reconocen igual. El valor se reemplaza
 * por un marcador fijo: nunca se guarda el original ni un hash suyo.
 */
export const REDACTED = '***REDACTED***';

/** Fragmentos de clave normalizada que marcan un campo sensible. */
export const SENSITIVE_KEY_FRAGMENTS = [
  'password',
  'contrasena',
  'passwd',
  'token',
  'secret',
  'reseturl',
  'authorization',
  'cookie',
  'apikey',
  'privatekey',
  'credential',
  'credencial',
] as const;

const MAX_DEPTH = 20;

export function normalizeAuditKey(key: string): string {
  return key
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function isSensitiveAuditKey(key: string): boolean {
  const normalized = normalizeAuditKey(key);
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

export function redactAuditValue(value: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (depth >= MAX_DEPTH) {
    return '[profundidad-maxima]';
  }
  if (seen.has(value)) {
    return '[circular]';
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => redactAuditValue(item, depth + 1, seen));
  }
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    result[key] = isSensitiveAuditKey(key) ? REDACTED : redactAuditValue(item, depth + 1, seen);
  }
  return result;
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const { method, url, user, ip, body } = request;
    const controller = context.getClass().name;
    const handler = context.getHandler().name;

    const shouldAudit = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

    if (!shouldAudit) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(async (data) => {
        try {
          await this.prisma.bitacoraAuditoria.create({
            data: {
              idUsuario: user?.userId || null,
              accion: `${method} ${url}`,
              tipoObjeto: `${controller}.${handler}`,
              idObjeto: this.extractIdFromData(data),
              detalleJson: {
                method,
                url,
                body: redactAuditValue(body ?? null),
                response: redactAuditValue(data ?? null),
              } as Prisma.InputJsonValue,
              ipOrigen: ip || request.headers['x-forwarded-for'] || 'unknown',
            },
          });
        } catch (error) {
          this.logger.error('Audit logging failed', error);
        }
      }),
    );
  }

  private extractIdFromData(data: unknown): string | null {
    if (!data || typeof data !== 'object') return null;
    const record = data as Record<string, unknown>;

    const idFields = [
      'idProyecto',
      'idUsuario',
      'idPostulacion',
      'idTarea',
      'idNotificacion',
      'id',
    ];

    for (const field of idFields) {
      if (record[field]) {
        return String(record[field]);
      }
    }

    return null;
  }
}
