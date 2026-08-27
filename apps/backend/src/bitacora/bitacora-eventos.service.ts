import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TipoEntidadBitacora, TipoEventoBitacora } from './tipos-evento-bitacora';

export interface RegistrarEventoBitacoraInput {
  /**
   * Requerido: el evento SIEMPRE se escribe con el mismo `tx` que la
   * operación principal (tasks.service.ts / sprints.service.ts), nunca con
   * `PrismaService` directo — así, si la operación principal revierte, el
   * evento revierte con ella (sin eventos huérfanos), y si el evento falla,
   * la operación principal también revierte (bitácora funcional, no un log
   * best-effort como NotificationsService).
   */
  tx: Prisma.TransactionClient;
  tipoEvento: TipoEventoBitacora;
  idActor: number;
  idProyecto: number;
  idSprint?: number | null;
  tipoEntidad: TipoEntidadBitacora;
  idEntidad: number;
  valorAnterior?: Prisma.InputJsonValue | null;
  valorNuevo?: Prisma.InputJsonValue | null;
}

/**
 * T-163: helper centralizado de la bitácora semántica de Sprint (HU-140).
 * Reutiliza la tabla `bitacora_auditoria` existente (sin migración) pero
 * escribe desde este servicio nuevo, nunca desde AuditInterceptor, para no
 * mezclar el log técnico genérico (method/url/body) con el log funcional
 * tipado que consulta T-164.
 */
@Injectable()
export class BitacoraEventosService {
  async registrarEvento(input: RegistrarEventoBitacoraInput): Promise<void> {
    const {
      tx,
      tipoEvento,
      idActor,
      idProyecto,
      idSprint,
      tipoEntidad,
      idEntidad,
      valorAnterior,
      valorNuevo,
    } = input;

    await tx.bitacoraAuditoria.create({
      data: {
        idUsuario: idActor,
        accion: tipoEvento,
        tipoObjeto: tipoEntidad,
        idObjeto: String(idEntidad),
        detalleJson: {
          idProyecto,
          idSprint: idSprint ?? null,
          valorAnterior: valorAnterior ?? null,
          valorNuevo: valorNuevo ?? null,
        } as Prisma.InputJsonValue,
      },
    });
  }
}
