import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EstadoParticipacion, EstadoSprint, Prisma } from '@prisma/client';
import {
  ENTITY_SPRINT_INVALID_MESSAGE,
  FINALIZING_SPRINT_MESSAGE,
  NO_ACTIVE_SPRINT_MESSAGE,
  NO_FINALIZING_SPRINT_MESSAGE,
  OPERABLE_SPRINT_EXISTS_MESSAGE,
  PROJECT_STATE_BY_CODE,
  PROJECT_STATE_INVALID_CODE,
  PROJECT_STATE_INVALID_MESSAGE,
  type EntitySprintRequirement,
  type ProjectStates,
  type ProjectWriteFamily,
  type SprintRequirement,
  type WriteActorRule,
} from '../guards/project-write.metadata';
import {
  ProjectIdResolverService,
  type ProjectIdRequestLike,
  type ProjectIdSource,
  type ResolvedProjectId,
} from './project-id-resolver.service';
import type { ProjectLockRow } from './project-transaction.service';

/**
 * Sprint 7 (06 v2 §32/§33/§40): catálogo declarativo de políticas de
 * escritura y asserts transaccionales. Los asserts reciben `tx` y NUNCA
 * abren una transacción: se ejecutan después del lock del proyecto y
 * repiten la autorización mutable aunque el guard ya haya aprobado el
 * ambiente. El servicio depende solo de Prisma; no importa dominio ni
 * Notifications.
 */

export interface ProjectWritePolicy {
  actor: WriteActorRule;
  states: ProjectStates;
  sprint: SprintRequirement;
  entity: EntitySprintRequirement;
  descripcion: string;
}

const ALL_STATES: ProjectStates = ['B', 'R', 'O', 'P', 'E', 'S', 'C'];
const PREPUBLICATION_AND_OPERATIVE: ProjectStates = ['B', 'R', 'O', 'P', 'E'];
const OPERATIVE: ProjectStates = ['P', 'E'];

/** Una entrada por fila de la tabla de 06 v2 §32. */
export const PROJECT_WRITE_POLICY_CATALOG: Readonly<Record<ProjectWriteFamily, ProjectWritePolicy>> = {
  TAREA_WRITE: {
    actor: 'ACTOR_EXISTENTE',
    states: OPERATIVE,
    sprint: 'ACTIVO',
    entity: 'ACTIVO',
    descripcion: 'Crear/editar/estado/borrar tarea (HU-D4 actual: activo/rol/líder según acción); entidad ACTIVO salvo crear',
  },
  TAREA_ASIGNACION: {
    actor: 'ACTOR_EXISTENTE',
    states: OPERATIVE,
    sprint: 'ACTIVO',
    entity: 'ACTIVO',
    descripcion: 'Asignar/desasignar/cerrar tramo (mismo rol/líder o autor en cerrar); destino elegible; recalcular antes de cerrar',
  },
  AVANCE: {
    actor: 'ACTOR_EXISTENTE',
    states: OPERATIVE,
    sprint: 'ACTIVO',
    entity: 'ACTIVO',
    descripcion: 'Avance create/update por el propietario del tramo/avance; no modifica un Sprint histórico',
  },
  REGISTRO_TIEMPO: {
    actor: 'ACTOR_EXISTENTE',
    states: OPERATIVE,
    sprint: 'ACTIVO',
    entity: 'ACTIVO',
    descripcion: 'Time create/edit/revoke por el propietario; predicados distintos de §9',
  },
  AJUSTE_HORA: {
    actor: 'LIDER',
    states: OPERATIVE,
    sprint: 'EN_FINALIZACION',
    entity: 'EN_FINALIZACION',
    descripcion: 'Ajuste del líder sobre tramo cerrado no consumido',
  },
  ROL_CRUD: {
    actor: 'LIDER',
    states: PREPUBLICATION_AND_OPERATIVE,
    sprint: 'ANY',
    entity: 'NO_CERRADO',
    descripcion: 'Roles CRUD sin mutar filas de Sprint cerrado; DELETE conserva checks de referencias',
  },
  ROL_ALTA_PARTICIPACION: {
    actor: 'LIDER',
    states: PREPUBLICATION_AND_OPERATIVE,
    sprint: 'NOT_FINALIZING',
    entity: 'ANY',
    descripcion: 'Participación rol alta del líder propio: cupo/elegibilidad/Q1; no autojoin de otro usuario',
  },
  ROL_RETIRO: {
    actor: 'ACTOR_EXISTENTE',
    states: PREPUBLICATION_AND_OPERATIVE,
    sprint: 'NOT_FINALIZING',
    entity: 'ACTIVO',
    descripcion: 'Retiro rol acotado por el participante propio con otro rol; tramos afectados ACTIVO; Serializable local',
  },
  ETIQUETA_CRUD: {
    actor: 'LIDER',
    states: PREPUBLICATION_AND_OPERATIVE,
    sprint: 'ANY',
    entity: 'NO_CERRADO',
    descripcion: 'Etiquetas CRUD; mutación de vínculos históricos prohibida (DELETE con vínculo cerrado → 409)',
  },
  ETIQUETA_TAREA: {
    actor: 'LIDER',
    states: OPERATIVE,
    sprint: 'ACTIVO',
    entity: 'ACTIVO',
    descripcion: 'Etiquetas de tarea PUT/DELETE bajo run',
  },
  COMENTARIO_PROYECTO_HITO: {
    actor: 'ACTOR_EXISTENTE',
    states: PREPUBLICATION_AND_OPERATIVE,
    sprint: 'ANY',
    entity: 'ANY',
    descripcion: 'Comentarios de proyecto/hito: líder B/R/O; activo P/E; autor para editar/borrar; S/C no',
  },
  COMENTARIO_TAREA: {
    actor: 'ACTOR_EXISTENTE',
    states: PREPUBLICATION_AND_OPERATIVE,
    sprint: 'ANY',
    entity: 'ACTIVO',
    descripcion: 'Comentarios de tarea: anotación de tarea existente con Sprint ACTIVO; no creación operativa prepub',
  },
  SPRINT_START: {
    actor: 'LIDER',
    states: OPERATIVE,
    sprint: 'NONE_OPERABLE',
    entity: 'ANY',
    descripcion: 'Sprint start: policy + run + unique operable',
  },
  SPRINT_FINALIZE: {
    actor: 'LIDER',
    states: OPERATIVE,
    sprint: 'ACTIVO',
    entity: 'ACTIVO',
    descripcion: 'Sprint finalize: ID exacto ACTIVO (§12)',
  },
  SPRINT_CLOSE: {
    actor: 'LIDER',
    states: OPERATIVE,
    sprint: 'EN_FINALIZACION',
    entity: 'EN_FINALIZACION',
    descripcion: 'Sprint close: ID exacto EN_FINALIZACION (§12)',
  },
  HITO_CREATE: {
    actor: 'LIDER_O_PARTICIPANTE_ACTIVO',
    states: PREPUBLICATION_AND_OPERATIVE,
    sprint: 'ANY',
    entity: 'ANY',
    descripcion: 'Crear hito por líder o activo preservando el actor real; bloquear S/C; conservar fórmulas',
  },
  PROYECTO_EDICION: {
    actor: 'LIDER',
    states: ['B', 'O', 'P', 'E'],
    sprint: 'ANY',
    entity: 'NO_CERRADO',
    descripcion: 'Edición de proyecto: B/O completa, P/E parcial; no cambia datos de Sprint cerrado',
  },
  PUBLICACION_ENVIO: {
    actor: 'LIDER',
    states: ['B', 'O'],
    sprint: 'ANY',
    entity: 'ANY',
    descripcion: 'Envío B→R y reenvío O→R de publicación',
  },
  PUBLICACION_REVISION: {
    actor: 'ADMIN',
    states: ['R'],
    sprint: 'ANY',
    entity: 'ANY',
    descripcion: 'Resolver/reclamar revisión de publicación (entidad RevisionProyecto)',
  },
  MENSAJE_REVISION: {
    actor: 'ACTOR_EXISTENTE',
    states: ['R', 'O', 'P', 'E'],
    sprint: 'ANY',
    entity: 'ANY',
    descripcion: 'Mensaje de revisión inicial por líder/admin; S/C bloqueado',
  },
  MENSAJE_REVISION_ACUSE: {
    actor: 'ACTOR_EXISTENTE',
    states: ALL_STATES,
    sprint: 'ANY',
    entity: 'ANY',
    descripcion: 'Acuse personal de mensaje: excepción sin cambio de dominio ni Sprint; fuera del lock de proyecto',
  },
  POSTULACION: {
    actor: 'ACTOR_EXISTENTE',
    states: OPERATIVE,
    sprint: 'ANY',
    entity: 'ANY',
    descripcion: 'Postulación crear/resolver/retirar por actor existente propio/líder; CAS/cupo bajo lock',
  },
  SALIDA: {
    actor: 'ACTOR_EXISTENTE',
    states: OPERATIVE,
    sprint: 'NOT_FINALIZING',
    entity: 'ACTIVO',
    descripcion: 'Salidas (cinco operaciones) propio/líder según fase; trabajo afectado ACTIVO si existe',
  },
  LIDERAZGO: {
    actor: 'ACTOR_EXISTENTE',
    states: OPERATIVE,
    sprint: 'ANY',
    entity: 'ANY',
    descripcion: 'Liderazgo/apelaciones por líder/admin según acción (§18–§20)',
  },
  CIERRE_PREPARACION: {
    actor: 'LIDER',
    states: ['E'],
    sprint: 'NONE_OPERABLE',
    entity: 'ANY',
    descripcion: 'Preparación y PDF automático: todos los Sprints CERRADO para generar',
  },
  CIERRE_EVIDENCIAS: {
    actor: 'LIDER',
    states: ['E', 'S'],
    sprint: 'ANY',
    entity: 'ANY',
    descripcion: 'Evidencias/borrador sobre la revisión BORRADOR (§25–§27)',
  },
  CIERRE_ENVIO: {
    actor: 'LIDER',
    states: ['E', 'S'],
    sprint: 'NONE_OPERABLE',
    entity: 'ANY',
    descripcion: 'Enviar (E) y reenvío documental (S): todos los Sprints CERRADO',
  },
  CIERRE_VEREDICTO: {
    actor: 'ADMIN',
    states: ['S'],
    sprint: 'NONE_OPERABLE',
    entity: 'ANY',
    descripcion: 'Veredictos de cierre por admin (§29–§31)',
  },
  CIERRE_LIMPIEZA: {
    actor: 'ADMIN',
    states: ALL_STATES,
    sprint: 'ANY',
    entity: 'ANY',
    descripcion: 'Reserva/finalización de purga por admin o job técnico; solo documentos sin referencias',
  },
};

export interface WriteEntityContext {
  /** Sprint de la entidad afectada (tarea, asignación, Sprint exacto…), si aplica. */
  sprintId?: number | null;
  /** Permite relajar la exigencia de entidad de la familia (p. ej. crear tarea, que no tiene entidad previa). */
  entityRequirement?: EntitySprintRequirement;
}

type TxClient = Prisma.TransactionClient;

const ESTADOS_SPRINT_OPERABLE = [EstadoSprint.ACTIVO, EstadoSprint.EN_FINALIZACION] as const;

@Injectable()
export class ProjectPolicyService {
  constructor(private readonly resolver: ProjectIdResolverService) {}

  policyFor(family: ProjectWriteFamily): ProjectWritePolicy {
    return PROJECT_WRITE_POLICY_CATALOG[family];
  }

  resolveProjectId(
    sources: ProjectIdSource | ProjectIdSource[],
    request: ProjectIdRequestLike,
  ): Promise<ResolvedProjectId> {
    return this.resolver.resolve(sources, request);
  }

  /**
   * Autorización mutable después del lock: actor, estado de proyecto,
   * ambiente y (si hay entidad) Sprint de la entidad. No abre transacción.
   */
  async assertWriteTx(
    tx: TxClient,
    project: ProjectLockRow,
    family: ProjectWriteFamily,
    actorId: number,
    entity?: WriteEntityContext,
  ): Promise<void> {
    const policy = this.policyFor(family);
    this.assertProjectState(project, policy.states);
    await this.assertActorTx(tx, project, policy.actor, actorId);
    await this.assertEnvironmentTx(tx, project.idProyecto, policy.sprint);
    if (entity?.sprintId !== undefined && entity.sprintId !== null) {
      await this.assertEntitySprintTx(tx, entity.sprintId, entity.entityRequirement ?? policy.entity);
    }
  }

  assertProjectState(project: Pick<ProjectLockRow, 'estadoProyecto'>, states: ProjectStates): void {
    const allowed = states.map((code) => PROJECT_STATE_BY_CODE[code]);
    if (!allowed.includes(project.estadoProyecto)) {
      throw new ConflictException({
        statusCode: 409,
        code: PROJECT_STATE_INVALID_CODE,
        message: PROJECT_STATE_INVALID_MESSAGE,
      });
    }
  }

  async assertActorTx(
    tx: TxClient,
    project: Pick<ProjectLockRow, 'idProyecto' | 'creadoPor'>,
    rule: WriteActorRule,
    actorId: number,
  ): Promise<void> {
    switch (rule) {
      case 'ACTOR_EXISTENTE':
        return;
      case 'LIDER':
        if (project.creadoPor !== actorId) {
          throw new ForbiddenException('Solo el líder del proyecto puede realizar esta operación');
        }
        return;
      case 'ADMIN':
        await this.assertAdminTx(tx, actorId);
        return;
      case 'PARTICIPANTE_ACTIVO':
        if (!(await this.hasActiveParticipationTx(tx, project.idProyecto, actorId))) {
          throw new ForbiddenException('Solo un participante activo del proyecto puede realizar esta operación');
        }
        return;
      case 'LIDER_O_PARTICIPANTE_ACTIVO':
        if (
          project.creadoPor !== actorId &&
          !(await this.hasActiveParticipationTx(tx, project.idProyecto, actorId))
        ) {
          throw new ForbiddenException(
            'Solo el líder o un participante activo del proyecto puede realizar esta operación',
          );
        }
        return;
      default:
        throw new ForbiddenException('Regla de actor desconocida');
    }
  }

  /** Ambiente: el Sprint operable del proyecto (ACTIVO o EN_FINALIZACION), consultado con `tx`. */
  async assertEnvironmentTx(tx: TxClient, projectId: number, requirement: SprintRequirement): Promise<void> {
    if (requirement === 'ANY') {
      return;
    }
    const operable = await tx.sprint.findFirst({
      where: { idProyecto: projectId, estado: { in: [...ESTADOS_SPRINT_OPERABLE] } },
      select: { idSprint: true, estado: true },
    });
    this.assertEnvironmentState(operable?.estado ?? null, requirement);
  }

  /** Evaluación pura del ambiente a partir del estado del Sprint operable (null = ninguno). */
  assertEnvironmentState(operable: EstadoSprint | null, requirement: SprintRequirement): void {
    switch (requirement) {
      case 'ANY':
        return;
      case 'ACTIVO':
        if (operable === null) {
          throw new ConflictException(NO_ACTIVE_SPRINT_MESSAGE);
        }
        if (operable === EstadoSprint.EN_FINALIZACION) {
          throw new ConflictException(FINALIZING_SPRINT_MESSAGE);
        }
        return;
      case 'NOT_FINALIZING':
        if (operable === EstadoSprint.EN_FINALIZACION) {
          throw new ConflictException(FINALIZING_SPRINT_MESSAGE);
        }
        return;
      case 'EN_FINALIZACION':
        if (operable !== EstadoSprint.EN_FINALIZACION) {
          throw new ConflictException(NO_FINALIZING_SPRINT_MESSAGE);
        }
        return;
      case 'NONE_OPERABLE':
        if (operable !== null) {
          throw new ConflictException(OPERABLE_SPRINT_EXISTS_MESSAGE);
        }
        return;
      default:
        throw new ConflictException('Exigencia de Sprint desconocida');
    }
  }

  /**
   * Sprint de la ENTIDAD afectada. Se ejecuta aunque el guard haya aprobado
   * el ambiente: un Sprint N+1 ACTIVO nunca habilita escribir filas del
   * Sprint N cerrado.
   */
  async assertEntitySprintTx(tx: TxClient, sprintId: number, requirement: EntitySprintRequirement): Promise<void> {
    if (requirement === 'ANY') {
      return;
    }
    const sprint = await tx.sprint.findUnique({ where: { idSprint: sprintId }, select: { estado: true } });
    if (!sprint) {
      throw new NotFoundException(`Sprint con id ${sprintId} no encontrado`);
    }
    this.assertEntitySprintState(sprint.estado, requirement);
  }

  assertEntitySprintState(estado: EstadoSprint, requirement: EntitySprintRequirement): void {
    switch (requirement) {
      case 'ANY':
        return;
      case 'ACTIVO':
        if (estado !== EstadoSprint.ACTIVO) {
          throw new ConflictException(ENTITY_SPRINT_INVALID_MESSAGE);
        }
        return;
      case 'EN_FINALIZACION':
        if (estado !== EstadoSprint.EN_FINALIZACION) {
          throw new ConflictException(ENTITY_SPRINT_INVALID_MESSAGE);
        }
        return;
      case 'NO_CERRADO':
        if (estado === EstadoSprint.CERRADO) {
          throw new ConflictException(ENTITY_SPRINT_INVALID_MESSAGE);
        }
        return;
      default:
        throw new ConflictException('Exigencia de entidad desconocida');
    }
  }

  /** Admin validado en BD dentro de la tx: usuarioRolAcceso → rolAcceso.nombrePerfil = 'administrador'. */
  async assertAdminTx(tx: TxClient, actorId: number): Promise<void> {
    const record = await tx.usuarioRolAcceso.findFirst({
      where: { idUsuario: actorId, rolAcceso: { nombrePerfil: 'administrador' } },
      select: { idUsuarioRolAcceso: true },
    });
    if (!record) {
      throw new ForbiddenException('Acceso restringido a administradores');
    }
  }

  private async hasActiveParticipationTx(tx: TxClient, projectId: number, actorId: number): Promise<boolean> {
    const participation = await tx.participacionProyecto.findFirst({
      where: {
        idUsuario: actorId,
        estadoParticipacion: EstadoParticipacion.ACTIVO,
        rolProyecto: { idProyecto: projectId },
      },
      select: { idParticipacion: true },
    });
    return participation !== null;
  }
}
