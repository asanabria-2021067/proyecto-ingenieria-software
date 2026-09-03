import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BitacoraContextService } from './bitacora-context.service';
import { TipoEntidadBitacora, TipoEventoBitacora, TipoEventoBitacoraValor } from './tipos-evento-bitacora';
import { BitacoraPaginadaDto, EventoBitacoraDto, FiltrosBitacoraInput } from './dto/bitacora-evento.dto';

/** Mismo subconjunto público de Usuario que HISTORY_USUARIO_SELECT (sprints.service.ts) — nunca el objeto completo. */
const ACTOR_SELECT = {
  idUsuario: true,
  nombre: true,
  apellido: true,
  fotoUrl: true,
} as const;

interface DetalleJsonEvento {
  idProyecto: number;
  idSprint: number | null;
  valorAnterior: unknown;
  valorNuevo: unknown;
}

/**
 * T-164: `GET /proyectos/:id/bitacora` — exclusivo del líder
 * (BitacoraContextService.assertProjectLeader, a diferencia de
 * tareas/sprints que también permiten al participante activo). El
 * aislamiento cross-project no puede apoyarse en una columna `idProyecto`
 * real (bitacora_auditoria no la tiene y T-140 exige "sin migración"), así
 * que vive en un filtro `detalleJson.idProyecto` sobre el JSON escrito por
 * BitacoraEventosService — nunca confiado a un filtro posterior en memoria.
 * `accion IN (...TipoEventoBitacora)` excluye siempre las filas genéricas de
 * AuditInterceptor (que escribe `"${method} ${url}"` en `accion`, un valor
 * que nunca coincide con el enum funcional), separando el log técnico del
 * funcional sin tocar el esquema.
 */
@Injectable()
export class BitacoraConsultaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bitacoraContext: BitacoraContextService,
  ) {}

  async listEventos(
    projectId: number,
    userId: number,
    filtros: FiltrosBitacoraInput,
  ): Promise<BitacoraPaginadaDto> {
    await this.bitacoraContext.assertProjectLeader(projectId, userId);

    const { idSprint, idActor, tipoEvento, page, limit } = filtros;

    const andConditions: Prisma.BitacoraAuditoriaWhereInput[] = [
      { accion: tipoEvento ? tipoEvento : { in: [...TipoEventoBitacora.VALORES] } },
      { detalleJson: { path: ['idProyecto'], equals: projectId } },
    ];
    if (idSprint !== undefined) {
      andConditions.push({ detalleJson: { path: ['idSprint'], equals: idSprint } });
    }
    if (idActor !== undefined) {
      andConditions.push({ idUsuario: idActor });
    }

    const where: Prisma.BitacoraAuditoriaWhereInput = { AND: andConditions };
    const skip = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      this.prisma.bitacoraAuditoria.findMany({
        where,
        orderBy: { fechaEvento: 'desc' },
        take: limit,
        skip,
        include: { usuario: { select: ACTOR_SELECT } },
      }),
      this.prisma.bitacoraAuditoria.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.mapEvento(row)),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  private mapEvento(
    row: Prisma.BitacoraAuditoriaGetPayload<{ include: { usuario: { select: typeof ACTOR_SELECT } } }>,
  ): EventoBitacoraDto {
    const detalle = (row.detalleJson ?? {}) as Partial<DetalleJsonEvento>;

    return {
      idAuditoria: row.idAuditoria,
      tipoEvento: row.accion as TipoEventoBitacoraValor,
      tipoEntidad: row.tipoObjeto as TipoEntidadBitacora,
      idEntidad: Number(row.idObjeto),
      idProyecto: detalle.idProyecto as number,
      idSprint: detalle.idSprint ?? null,
      valorAnterior: detalle.valorAnterior ?? null,
      valorNuevo: detalle.valorNuevo ?? null,
      fechaEvento: row.fechaEvento,
      actor: row.usuario,
    };
  }
}
