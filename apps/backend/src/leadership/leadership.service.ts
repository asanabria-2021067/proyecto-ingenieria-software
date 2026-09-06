import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EstadoApelacionLiderazgo, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ProjectTransactionService,
  type ProjectLockRow,
  type ProjectTransactionContext,
} from '../common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../common/project-policy/project-policy.service';
import { ProjectEligibilityService } from '../eligibility/project-eligibility.service';
import { BitacoraEventosService } from '../bitacora/bitacora-eventos.service';
import { TipoEventoBitacora } from '../bitacora/tipos-evento-bitacora';
import { CreateLeadershipAppealDto } from './dto/create-leadership-appeal.dto';

/**
 * C091/C093 (06 v2 §18/§19): escrituras de liderazgo — ciclo de vida de la
 * apelación y el motor ÚNICO de cambio de líder.
 *
 * `Proyecto.creadoPor` es la única fuente de verdad sobre quién lidera: este
 * servicio no introduce estado de exlíder, rol sintético, bandeja de expulsión
 * ni participación fabricada. Perder el liderazgo no crea ni destruye
 * membresía; lo que el saliente conserva se deriva de su participación real.
 */

export interface ApelacionPublica {
  idApelacion: number;
  idProyecto: number;
  idLiderSolicitante: number;
  asunto: string;
  mensaje: string;
  idCandidatoPropuesto: number;
  estadoApelacion: EstadoApelacionLiderazgo;
  creadaEn: Date;
  resueltaEn: Date | null;
  idAdminResolutor: number | null;
  mensajeResolucion: string | null;
}

export const APELACION_SELECT = {
  idApelacion: true,
  idProyecto: true,
  idLiderSolicitante: true,
  asunto: true,
  mensaje: true,
  idCandidatoPropuesto: true,
  estadoApelacion: true,
  creadaEn: true,
  resueltaEn: true,
  idAdminResolutor: true,
  mensajeResolucion: true,
} satisfies Prisma.ApelacionLiderazgoSelect;

type ApelacionRow = Prisma.ApelacionLiderazgoGetPayload<{ select: typeof APELACION_SELECT }>;

/** La bitácora guarda JSON: las fechas viajan en ISO para que el detalle se lea sin reconstruir tipos. */
function snapshotApelacion(row: ApelacionRow): Record<string, string | number | boolean | null> {
  return {
    ...row,
    creadaEn: row.creadaEn.toISOString(),
    resueltaEn: row.resueltaEn?.toISOString() ?? null,
  };
}

@Injectable()
export class LeadershipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectTx: ProjectTransactionService,
    private readonly policy: ProjectPolicyService,
    private readonly eligibility: ProjectEligibilityService,
    private readonly notifications: NotificationsService,
    private readonly bitacoraEventos: BitacoraEventosService,
  ) {}

  private lockedProject(ctx: Pick<ProjectTransactionContext, 'project'>): ProjectLockRow {
    if (!ctx.project) {
      throw new NotFoundException('Proyecto no encontrado');
    }
    return ctx.project;
  }

  /** §18–§20: apelar, cancelar y transferir son potestad del líder ACTUAL, leído bajo el lock. */
  private assertCurrentLeader(project: ProjectLockRow, actorId: number): void {
    if (project.creadoPor !== actorId) {
      throw new ForbiddenException('Solo el líder actual del proyecto puede realizar esta operación');
    }
  }

  /**
   * E097 (§19): el líder actual pide que se transfiera su liderazgo.
   *
   * Crear la apelación NO cambia el liderazgo ni toca una sola participación:
   * es una solicitud dirigida a los administradores. El texto queda inmutable
   * desde este momento — no existe ninguna ruta que lo edite — porque una
   * solicitud que se reescribe después de recibida deja de ser evidencia.
   */
  async createAppeal(
    projectId: number,
    actorId: number,
    dto: CreateLeadershipAppealDto,
  ): Promise<ApelacionPublica> {
    return this.projectTx.run(projectId, actorId, 'leadership.createAppeal', async (ctx) => {
      const { tx } = ctx;
      const project = this.lockedProject(ctx);
      await this.policy.assertWriteTx(tx, project, 'LIDERAZGO', actorId);
      this.assertCurrentLeader(project, actorId);

      const asunto = dto.asunto?.trim() ?? '';
      const mensaje = dto.mensaje?.trim() ?? '';
      // CK10 lo exige en base de datos; rechazarlo aquí devuelve un 400 con
      // sentido en vez de un error de constraint.
      if (asunto.length === 0 || asunto.length > 200) {
        throw new BadRequestException('asunto debe tener entre 1 y 200 caracteres');
      }
      if (mensaje.length === 0 || mensaje.length > 10000) {
        throw new BadRequestException('mensaje debe tener entre 1 y 10000 caracteres');
      }

      // El candidato sugerido debe ser elegible AHORA; volverá a comprobarse
      // bajo transacción al resolver, porque puede dejar de serlo entretanto.
      await this.eligibility.assertLeadershipCandidate(tx, {
        projectId,
        userId: dto.idCandidatoPropuesto,
        liderActualId: actorId,
      });

      const pendiente = await tx.apelacionLiderazgo.findFirst({
        where: {
          idProyecto: projectId,
          idLiderSolicitante: actorId,
          estadoApelacion: EstadoApelacionLiderazgo.PENDIENTE,
        },
        select: { idApelacion: true },
      });
      if (pendiente) {
        throw new ConflictException({
          statusCode: 409,
          code: 'APELACION_PENDIENTE_EXISTENTE',
          message: 'Ya existe una apelación pendiente de este líder en el proyecto',
        });
      }

      const creada = await this.insertAppeal(tx, {
        projectId,
        actorId,
        asunto,
        mensaje,
        idCandidatoPropuesto: dto.idCandidatoPropuesto,
      });

      await this.bitacoraEventos.registrarEvento({
        tx,
        tipoEvento: TipoEventoBitacora.LEADERSHIP_APPEAL_CREATED,
        idActor: actorId,
        idProyecto: projectId,
        tipoEntidad: 'APELACION_LIDERAZGO',
        idEntidad: creada.idApelacion,
        valorAnterior: null,
        valorNuevo: snapshotApelacion(creada),
      });

      const [proyecto, lider] = await Promise.all([
        tx.proyecto.findUniqueOrThrow({
          where: { idProyecto: projectId },
          select: { tituloProyecto: true },
        }),
        tx.usuario.findUniqueOrThrow({
          where: { idUsuario: actorId },
          select: { nombre: true, apellido: true },
        }),
      ]);
      // Las filas viven en la MISMA transacción que la apelación; solo el
      // aviso por socket espera al commit.
      await this.notifications.persistAdminsTx(
        tx,
        'APELACION_LIDERAZGO_RECIBIDA',
        {
          projectTitle: proyecto.tituloProyecto,
          projectId,
          appealId: creada.idApelacion,
          asunto: creada.asunto,
          leaderName: `${lider.nombre} ${lider.apellido}`.trim(),
        },
        ctx.effects,
      );

      return creada;
    });
  }

  /**
   * El índice parcial `s7_apelacion_pendiente` es la última línea de defensa
   * de «una pendiente por proyecto y líder»: si una carrera lo viola, se
   * traduce a 409 y se aborta, sin seguir consultando una transacción ya
   * fallida en PostgreSQL.
   */
  private async insertAppeal(
    tx: Prisma.TransactionClient,
    input: {
      projectId: number;
      actorId: number;
      asunto: string;
      mensaje: string;
      idCandidatoPropuesto: number;
    },
  ): Promise<ApelacionRow> {
    try {
      return await tx.apelacionLiderazgo.create({
        data: {
          idProyecto: input.projectId,
          idLiderSolicitante: input.actorId,
          asunto: input.asunto,
          mensaje: input.mensaje,
          idCandidatoPropuesto: input.idCandidatoPropuesto,
        },
        select: APELACION_SELECT,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          statusCode: 409,
          code: 'APELACION_PENDIENTE_EXISTENTE',
          message: 'Ya existe una apelación pendiente de este líder en el proyecto',
        });
      }
      throw error;
    }
  }
}
