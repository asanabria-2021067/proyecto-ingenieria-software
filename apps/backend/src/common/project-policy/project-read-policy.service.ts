import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EstadoParticipacion, EstadoProyecto, EstadoSprint, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Sprint 7 (06 v2 §34/§40/§41): decisor único de LECTURA por proyecto.
 * Determina el perfil del lector (líder actual, admin desde BD,
 * participante activo, participante histórico, exlíder sin participación,
 * externo), el estado del proyecto y el scope solicitado, y devuelve la
 * decisión con el filtro de Sprint que ese lector puede ver.
 *
 * NUNCA se reutiliza para autorizar escritura: la autorización de escritura
 * vive en ProjectPolicyService.assertWriteTx después del lock.
 */

export type ReadScope =
  | 'resumen'
  | 'equipo'
  | 'tareas'
  | 'sprints'
  | 'documentos'
  | 'horas'
  | 'bitacora'
  | 'liderazgo'
  | 'historico';

export type ReaderProfile =
  | 'LIDER'
  | 'ADMIN'
  | 'PARTICIPANTE_ACTIVO'
  | 'PARTICIPANTE_HISTORICO'
  | 'EXLIDER_SIN_PARTICIPACION'
  | 'EXTERNO';

export interface ReadProjectRow {
  idProyecto: number;
  estadoProyecto: EstadoProyecto;
  creadoPor: number;
  eliminadoEn: Date | null;
}

export interface ReadDecision {
  profile: ReaderProfile;
  project: ReadProjectRow;
  scope: ReadScope;
  /** Estados de Sprint visibles; `null` = todos. */
  sprintEstados: readonly EstadoSprint[] | null;
  /** Solo la propia contribución/hechos del actor (participante histórico en proyecto vivo, exlíder). */
  ownOnly: boolean;
  isAdmin: boolean;
}

export interface AssertReadInput {
  projectId: number;
  actorId: number;
  scope: ReadScope;
  /** Sprint concreto que se pretende leer; con perfiles restringidos a CERRADO se rechaza si no lo está. */
  entitySprintId?: number | null;
}

type Db = Prisma.TransactionClient | PrismaService;

const LIVE_STATES: readonly EstadoProyecto[] = [
  EstadoProyecto.PUBLICADO,
  EstadoProyecto.EN_PROGRESO,
  EstadoProyecto.EN_SOLICITUD_CIERRE,
];
const PREPUBLICATION_STATES: readonly EstadoProyecto[] = [
  EstadoProyecto.BORRADOR,
  EstadoProyecto.EN_REVISION,
  EstadoProyecto.OBSERVADO,
];
const ONLY_CLOSED: readonly EstadoSprint[] = [EstadoSprint.CERRADO];
const ALL_SCOPES: readonly ReadScope[] = [
  'resumen',
  'equipo',
  'tareas',
  'sprints',
  'documentos',
  'horas',
  'bitacora',
  'liderazgo',
  'historico',
];

@Injectable()
export class ProjectReadPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async assertRead(tx: Prisma.TransactionClient | undefined, input: AssertReadInput): Promise<ReadDecision> {
    const db: Db = tx ?? this.prisma;
    const project = await db.proyecto.findUnique({
      where: { idProyecto: input.projectId },
      select: { idProyecto: true, estadoProyecto: true, creadoPor: true, eliminadoEn: true },
    });
    if (!project || project.eliminadoEn !== null) {
      throw new NotFoundException(`Proyecto con id ${input.projectId} no encontrado`);
    }

    const profile = await this.profileFor(db, project, input.actorId);
    const decision = this.decide(profile, project, input.scope);

    if (
      input.entitySprintId !== undefined &&
      input.entitySprintId !== null &&
      decision.sprintEstados !== null
    ) {
      const sprint = await db.sprint.findFirst({
        where: { idSprint: input.entitySprintId, idProyecto: project.idProyecto },
        select: { estado: true },
      });
      if (!sprint) {
        throw new NotFoundException(
          `Sprint con id ${input.entitySprintId} no encontrado en el proyecto ${project.idProyecto}`,
        );
      }
      if (!decision.sprintEstados.includes(sprint.estado)) {
        throw new ForbiddenException('Este Sprint solo es visible para el líder actual mientras no esté cerrado');
      }
    }

    return decision;
  }

  /** Filtro Prisma de Sprint derivado de la decisión, para aplicarlo en la consulta (no en el DTO). */
  scopeForActor(decision: ReadDecision): { sprintWhere: Prisma.SprintWhereInput; ownOnly: boolean } {
    return {
      sprintWhere: decision.sprintEstados === null ? {} : { estado: { in: [...decision.sprintEstados] } },
      ownOnly: decision.ownOnly,
    };
  }

  private async profileFor(db: Db, project: ReadProjectRow, actorId: number): Promise<ReaderProfile> {
    if (project.creadoPor === actorId) {
      return 'LIDER';
    }
    if (await this.isAdmin(db, actorId)) {
      return 'ADMIN';
    }
    const participations = await db.participacionProyecto.findMany({
      where: { idUsuario: actorId, rolProyecto: { idProyecto: project.idProyecto } },
      select: { estadoParticipacion: true },
    });
    if (participations.some((row) => row.estadoParticipacion === EstadoParticipacion.ACTIVO)) {
      return 'PARTICIPANTE_ACTIVO';
    }
    if (participations.length > 0) {
      return 'PARTICIPANTE_HISTORICO';
    }
    const [historyAsLeader, appealsAsLeader] = await Promise.all([
      db.historialLiderazgo.count({
        where: { idProyecto: project.idProyecto, OR: [{ idLiderAnterior: actorId }, { idLiderNuevo: actorId }] },
      }),
      db.apelacionLiderazgo.count({ where: { idProyecto: project.idProyecto, idLiderSolicitante: actorId } }),
    ]);
    if (historyAsLeader > 0 || appealsAsLeader > 0) {
      return 'EXLIDER_SIN_PARTICIPACION';
    }
    return 'EXTERNO';
  }

  private async isAdmin(db: Db, actorId: number): Promise<boolean> {
    const record = await db.usuarioRolAcceso.findFirst({
      where: { idUsuario: actorId, rolAcceso: { nombrePerfil: 'administrador' } },
      select: { idUsuarioRolAcceso: true },
    });
    return record !== null;
  }

  /**
   * Matriz de 06 v2 §34 con las precisiones por ruta de §41:
   * - líder actual: todo en vivo; histórico completo en CERRADO;
   * - admin: resumen/equipo/liderazgo/bitácora y solo Sprints CERRADO en vivo; todo en CERRADO;
   * - participante activo: lecturas normales sin liderazgo/documentos/bitácora; histórico en CERRADO;
   * - participante retirado/completado: su contribución histórica en vivo; histórico en CERRADO;
   * - exlíder sin participación: vista pública P/E y sus propios hechos de liderazgo;
   * - externo: nada por esta política (el GET público de proyecto queda fuera de ella).
   */
  private decide(profile: ReaderProfile, project: ReadProjectRow, scope: ReadScope): ReadDecision {
    const closed = project.estadoProyecto === EstadoProyecto.CERRADO;
    const live = LIVE_STATES.includes(project.estadoProyecto);
    const prepublication = PREPUBLICATION_STATES.includes(project.estadoProyecto);
    const base = { project, scope, isAdmin: profile === 'ADMIN' };

    const allow = (sprintEstados: readonly EstadoSprint[] | null, ownOnly = false): ReadDecision => ({
      ...base,
      profile,
      sprintEstados,
      ownOnly,
    });
    const deny = (): never => {
      throw new ForbiddenException('No tienes acceso a esta información del proyecto');
    };

    if (!closed && !live && !prepublication) {
      // CANCELADO: solo líder y admin conservan lectura.
      return profile === 'LIDER' || profile === 'ADMIN' ? allow(null) : deny();
    }

    switch (profile) {
      case 'LIDER':
        return allow(null);
      case 'ADMIN':
        if (closed) {
          return allow(null);
        }
        return ALL_SCOPES.includes(scope) ? allow(ONLY_CLOSED) : deny();
      case 'PARTICIPANTE_ACTIVO':
        if (closed) {
          return allow(null);
        }
        return scope === 'liderazgo' || scope === 'documentos' || scope === 'bitacora' ? deny() : allow(null);
      case 'PARTICIPANTE_HISTORICO':
        if (closed) {
          return allow(null);
        }
        return scope === 'liderazgo' || scope === 'documentos' || scope === 'bitacora'
          ? deny()
          : allow(ONLY_CLOSED, true);
      case 'EXLIDER_SIN_PARTICIPACION':
        if (scope === 'liderazgo') {
          return allow(null, true);
        }
        return scope === 'resumen' && live ? allow(ONLY_CLOSED, true) : deny();
      case 'EXTERNO':
      default:
        return deny();
    }
  }
}
