import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BitacoraContextService } from './bitacora-context.service';
import { ProjectReadPolicyService } from '../common/project-policy/project-read-policy.service';
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
 * T-164/HU-170: `GET /proyectos/:id/bitacora` — líder, admin y (T-269)
 * participante activo en solo lectura, sin ver eventos administrativos
 * (`TipoEventoBitacora.ADMINISTRATIVOS`). El aislamiento cross-project no
 * puede apoyarse en una columna `idProyecto` real (bitacora_auditoria no la
 * tiene y T-140 exige "sin migración"), así que vive en un filtro
 * `detalleJson.idProyecto` sobre el JSON escrito por BitacoraEventosService —
 * nunca confiado a un filtro posterior en memoria. `accion IN (...)` excluye
 * siempre las filas genéricas de AuditInterceptor (que escribe
 * `"${method} ${url}"` en `accion`, un valor que nunca coincide con el enum
 * funcional), separando el log técnico del funcional sin tocar el esquema.
 */
@Injectable()
export class BitacoraConsultaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bitacoraContext: BitacoraContextService,
    private readonly readPolicy: ProjectReadPolicyService,
  ) {}

  /**
   * C048 (06 v2 §34/§43/§41 E091, ampliado por HU-170): la audiencia la
   * decide la política de lectura con scope `bitacora` —líder actual,
   * administrador y participante activo— en un solo lugar, en vez de repetir
   * la regla aquí. El perfil que devuelve esa decisión determina además si se
   * ven los eventos administrativos: nunca para un participante, aunque los
   * pida por filtro explícito de `tipoEvento` (ver `tiposVisiblesPara`). Los
   * filtros de la consulta y el contrato de HU-D3 se conservan intactos, y el
   * módulo no gana ningún writer por esta lectura.
   */
  async listEventos(
    projectId: number,
    userId: number,
    filtros: FiltrosBitacoraInput,
  ): Promise<BitacoraPaginadaDto> {
    const decision = await this.readPolicy.assertRead(undefined, {
      projectId,
      actorId: userId,
      scope: 'bitacora',
    });

    const { idSprint, idActor, persona, tipoEvento, desde, hasta, page, limit } = filtros;
    const puedeVerAdministrativos = decision.profile === 'LIDER' || decision.profile === 'ADMIN';
    const tiposVisibles = this.tiposVisiblesPara(puedeVerAdministrativos);

    const andConditions: Prisma.BitacoraAuditoriaWhereInput[] = [
      { accion: tipoEvento ? this.accionFiltroPara(tipoEvento, tiposVisibles) : { in: [...tiposVisibles] } },
      { detalleJson: { path: ['idProyecto'], equals: projectId } },
    ];
    if (idSprint !== undefined) {
      andConditions.push({ detalleJson: { path: ['idSprint'], equals: idSprint } });
    }
    if (idActor !== undefined) {
      andConditions.push({ idUsuario: idActor });
    }
    if (persona !== undefined) {
      andConditions.push({
        usuario: {
          OR: [
            { nombre: { contains: persona, mode: 'insensitive' } },
            { apellido: { contains: persona, mode: 'insensitive' } },
          ],
        },
      });
    }
    if (desde !== undefined) {
      andConditions.push({ fechaEvento: { gte: desde } });
    }
    if (hasta !== undefined) {
      andConditions.push({ fechaEvento: { lte: hasta } });
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

  /** HU-170: catálogo completo para líder/admin; sin administrativos para el resto. */
  private tiposVisiblesPara(puedeVerAdministrativos: boolean): readonly TipoEventoBitacoraValor[] {
    if (puedeVerAdministrativos) {
      return TipoEventoBitacora.VALORES;
    }
    return TipoEventoBitacora.VALORES.filter((valor) => !TipoEventoBitacora.ADMINISTRATIVOS.has(valor));
  }

  /**
   * Un participante que filtra explícitamente por un `tipoEvento`
   * administrativo (p. ej. `?tipoEvento=LEADERSHIP_CHANGED`) no debe recibir
   * esas filas solo porque las pidió por nombre: `{ in: [] }` fuerza cero
   * resultados en vez de colar el valor tal cual a `accion`.
   */
  private accionFiltroPara(
    tipoEvento: TipoEventoBitacoraValor,
    tiposVisibles: readonly TipoEventoBitacoraValor[],
  ): Prisma.BitacoraAuditoriaWhereInput['accion'] {
    return tiposVisibles.includes(tipoEvento) ? tipoEvento : { in: [] };
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
