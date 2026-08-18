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
                body: this.sanitizeResponse(body),
                response: this.sanitizeResponse(data),
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

  private sanitizeResponse(data: unknown): unknown {
    if (!data) return null;
    if (typeof data !== 'object') return data;

    const sensitiveFields = [
      'contrasena',
      'nuevaContrasena',
      'password',
      'token',
      'resetToken',
      'resetUrl',
      'secret',
    ];

    const sanitized = { ...data } as Record<string, unknown>;

    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '***REDACTED***';
      }
    }

    return sanitized;
  }
}
