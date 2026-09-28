import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { redactAuditValue } from '../common/interceptors/audit.interceptor';
import { TIPO_OBJETO_SEGURIDAD, TipoEventoSeguridadValor } from './tipos-evento-seguridad';
import type { SecurityRequestContext } from './request-context';

export interface SecurityEventInput {
  tipo: TipoEventoSeguridadValor;
  /** Usuario que ejecuta la acción (admin, o el propio usuario autenticado); null si no hay sesión. */
  idActor?: number | null;
  /** Cuenta afectada (idObjeto); null si no corresponde a una cuenta existente. */
  idUsuarioAfectado?: number | null;
  /** Detalle mínimo. Se redacta igual que el log técnico; nunca incluir tokens ni contraseñas. */
  detalle?: Record<string, unknown>;
  /** Origen de la petición (req.ip + si la IP proviene de un proxy confiable). */
  origen?: SecurityRequestContext;
}

/**
 * G05 (OWASP25-C037): writer BEST-EFFORT de eventos de seguridad.
 *
 * Escribe con su propia operación (PrismaService, fuera de la transacción del
 * llamador): un evento nunca revierte ni bloquea la operación que audita, y
 * una falla del almacenamiento de auditoría nunca cambia la respuesta de
 * autenticación. Si la escritura falla, deja un warning con el tipo de evento
 * y la clase del error, nunca el detalle ni valores del usuario, y devuelve
 * false. Es lo opuesto a BitacoraEventosService (bitácora funcional), que
 * escribe dentro de la transacción y la revierte si falla.
 */
@Injectable()
export class SecurityEventsService {
  private readonly logger = new Logger(SecurityEventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: SecurityEventInput): Promise<boolean> {
    try {
      await this.prisma.bitacoraAuditoria.create({
        data: {
          idUsuario: input.idActor ?? null,
          accion: input.tipo,
          tipoObjeto: TIPO_OBJETO_SEGURIDAD,
          idObjeto: input.idUsuarioAfectado != null ? String(input.idUsuarioAfectado) : null,
          detalleJson: redactAuditValue({
            ...(input.detalle ?? {}),
            ...(input.origen ? { ipTrusted: input.origen.ipTrusted } : {}),
          }) as Prisma.InputJsonValue,
          ...(input.origen ? { ipOrigen: input.origen.ip } : {}),
        },
      });
      return true;
    } catch (error) {
      const kind = error instanceof Error ? error.name : typeof error;
      this.logger.warn(`Evento de seguridad no registrado (${input.tipo}): ${kind}`);
      return false;
    }
  }
}
