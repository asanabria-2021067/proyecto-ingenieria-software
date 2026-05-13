import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
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
                body,
                response: this.sanitizeResponse(data),
              },
              ipOrigen: ip || request.headers['x-forwarded-for'] || 'unknown',
            },
          });
        } catch (error) {
          console.error('Audit logging failed:', error);
        }
      }),
    );
  }

  private extractIdFromData(data: any): string | null {
    if (!data) return null;

    const idFields = [
      'idProyecto',
      'idUsuario',
      'idPostulacion',
      'idTarea',
      'idNotificacion',
      'id',
    ];

    for (const field of idFields) {
      if (data[field]) {
        return String(data[field]);
      }
    }

    return null;
  }

  private sanitizeResponse(data: any): any {
    if (!data) return null;

    const sensitiveFields = ['contrasena', 'password', 'token', 'secret'];

    if (typeof data !== 'object') return data;

    const sanitized = { ...data };

    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '***REDACTED***';
      }
    }

    return sanitized;
  }
}
