import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EstadoParticipacion, EstadoProyecto, EstadoUsuario, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * C068 (06 v2 §17): fuente ÚNICA de la elegibilidad de un proyecto. Existe
 * para que ningún service vuelva a escribir su propia versión de «puede
 * recibir trabajo», «puede tomar el rol» o «puede ser el siguiente líder»: los
 * criterios divergentes entre servicios son exactamente el problema que este
 * servicio elimina.
 *
 * Los asserts de escritura EXIGEN el `tx` del caller, porque solo tienen
 * sentido después del lock del proyecto y en la misma vista que la escritura
 * que autorizan. Las consultas informativas lo aceptan opcionalmente: sirven
 * para pintar listas y no deben forzar una transacción.
 *
 * No hay ranking ni consentimiento del candidato: el servicio responde si
 * alguien es elegible y, cuando no lo es, POR QUÉ. Ordenar u ofrecer es
 * decisión de quien lo consume.
 */

/** Códigos estables de inelegibilidad; el consumidor los muestra o los traduce. */
export type MotivoInelegibilidad =
  | 'USUARIO_NO_EXISTE'
  | 'USUARIO_DESHABILITADO'
  | 'SIN_PARTICIPACION_ACTIVA'
  | 'SIN_PARTICIPACION_ACTIVA_EN_EL_ROL'
  | 'SALIDA_EN_CURSO'
  | 'ES_EL_LIDER_ACTUAL'
  | 'PROYECTO_NO_OPERATIVO'
  | 'ROL_SIN_CUPO'
  | 'YA_PARTICIPA_EN_EL_ROL';

export interface ResultadoElegibilidad {
  elegible: boolean;
  motivos: MotivoInelegibilidad[];
}

export interface CandidatoElegibilidad extends ResultadoElegibilidad {
  idUsuario: number;
  nombre: string;
  apellido: string;
  fotoUrl: string | null;
}

export interface AssignmentDestinationInput {
  projectId: number;
  /** Rol exigido por la tarea; `null` cuando la tarea no exige rol. */
  taskRoleId: number | null;
  userId: number;
  /**
   * §17: durante PREPARACION, el actor que entrega o reasigna su propio
   * trabajo NO queda excluido por su propia salida en curso. Solo se ignora
   * la salida de ESTE usuario, nunca la de un tercero.
   */
  handoverActorId?: number | null;
}

export interface LeadershipCandidateInput {
  projectId: number;
  userId: number;
  liderActualId: number;
}

export interface SelfAssignRoleInput {
  projectId: number;
  roleId: number;
  userId: number;
}

type Db = Prisma.TransactionClient | PrismaService;

/** Una salida abierta es la que todavía puede consumarse. */
const ESTADOS_SALIDA_ABIERTA = ['PREPARACION', 'PENDIENTE_LIDER'] as const;
const ESTADOS_PROYECTO_OPERATIVO: readonly EstadoProyecto[] = [
  EstadoProyecto.PUBLICADO,
  EstadoProyecto.EN_PROGRESO,
];

@Injectable()
export class ProjectEligibilityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Destino de una asignación de tarea. Exige participación ACTIVO en el
   * proyecto y, cuando la tarea pide rol, en ese rol concreto. Una salida
   * abierta excluye — salvo que el usuario sea el propio actor que está
   * entregando su trabajo durante la preparación de su salida.
   */
  async assertAssignmentDestination(
    tx: Prisma.TransactionClient,
    input: AssignmentDestinationInput,
  ): Promise<void> {
    const resultado = await this.evaluateAssignmentDestination(tx, input);
    if (!resultado.elegible) {
      throw new ConflictException({
        statusCode: 409,
        code: 'DESTINO_INELEGIBLE',
        message: 'El usuario no puede recibir esta asignación',
        motivos: resultado.motivos,
      });
    }
  }

  async evaluateAssignmentDestination(
    db: Db,
    input: AssignmentDestinationInput,
  ): Promise<ResultadoElegibilidad> {
    const motivos: MotivoInelegibilidad[] = [];
    const usuario = await this.loadUsuario(db, input.userId);
    if (!usuario) {
      return { elegible: false, motivos: ['USUARIO_NO_EXISTE'] };
    }
    if (usuario.estado !== EstadoUsuario.ACTIVO) {
      motivos.push('USUARIO_DESHABILITADO');
    }

    const participaciones = await this.activeParticipations(db, input.projectId, input.userId);
    if (participaciones.length === 0) {
      motivos.push('SIN_PARTICIPACION_ACTIVA');
    } else if (
      input.taskRoleId !== null &&
      !participaciones.some((fila) => fila.idRolProyecto === input.taskRoleId)
    ) {
      motivos.push('SIN_PARTICIPACION_ACTIVA_EN_EL_ROL');
    }

    const entregandoTrabajoPropio = input.handoverActorId === input.userId;
    if (!entregandoTrabajoPropio && (await this.hasOpenExit(db, input.projectId, input.userId))) {
      motivos.push('SALIDA_EN_CURSO');
    }

    return { elegible: motivos.length === 0, motivos };
  }

  /**
   * Candidatos de asignación de una tarea. Devuelve la lista COMPLETA con su
   * anotación de elegibilidad y sus motivos: filtrar es decisión del lector,
   * porque un equipo necesita ver a quien no puede recibir trabajo y por qué.
   */
  async listAssignmentCandidates(
    tx: Prisma.TransactionClient | undefined,
    input: { projectId: number; taskRoleId: number | null; handoverActorId?: number | null },
  ): Promise<CandidatoElegibilidad[]> {
    const db: Db = tx ?? this.prisma;
    const participaciones = await db.participacionProyecto.findMany({
      where: {
        estadoParticipacion: EstadoParticipacion.ACTIVO,
        rolProyecto: { idProyecto: input.projectId },
        ...(input.taskRoleId !== null ? { idRolProyecto: input.taskRoleId } : {}),
      },
      select: {
        usuario: { select: { idUsuario: true, nombre: true, apellido: true, fotoUrl: true } },
      },
    });
    return this.annotate(db, this.dedupe(participaciones), (userId) =>
      this.evaluateAssignmentDestination(db, {
        projectId: input.projectId,
        taskRoleId: input.taskRoleId,
        userId,
        handoverActorId: input.handoverActorId ?? null,
      }),
    );
  }

  /**
   * Sucesor de liderazgo: proyecto operativo, activo en cualquier rol del
   * proyecto, distinto del líder actual y sin salida abierta. No se pide
   * consentimiento ni se ordena por mérito.
   */
  async assertLeadershipCandidate(
    tx: Prisma.TransactionClient,
    input: LeadershipCandidateInput,
  ): Promise<void> {
    const resultado = await this.evaluateLeadershipCandidate(tx, input);
    if (!resultado.elegible) {
      throw new ConflictException({
        statusCode: 409,
        code: 'SUCESOR_INELEGIBLE',
        message: 'El usuario no puede recibir el liderazgo de este proyecto',
        motivos: resultado.motivos,
      });
    }
  }

  async evaluateLeadershipCandidate(
    db: Db,
    input: LeadershipCandidateInput,
  ): Promise<ResultadoElegibilidad> {
    const motivos: MotivoInelegibilidad[] = [];
    const proyecto = await db.proyecto.findFirst({
      where: { idProyecto: input.projectId, eliminadoEn: null },
      select: { estadoProyecto: true },
    });
    if (!proyecto) {
      throw new NotFoundException(`Proyecto con id ${input.projectId} no encontrado`);
    }
    if (!ESTADOS_PROYECTO_OPERATIVO.includes(proyecto.estadoProyecto)) {
      motivos.push('PROYECTO_NO_OPERATIVO');
    }

    const usuario = await this.loadUsuario(db, input.userId);
    if (!usuario) {
      return { elegible: false, motivos: [...motivos, 'USUARIO_NO_EXISTE'] };
    }
    if (usuario.estado !== EstadoUsuario.ACTIVO) {
      motivos.push('USUARIO_DESHABILITADO');
    }
    if (input.userId === input.liderActualId) {
      motivos.push('ES_EL_LIDER_ACTUAL');
    }
    if ((await this.activeParticipations(db, input.projectId, input.userId)).length === 0) {
      motivos.push('SIN_PARTICIPACION_ACTIVA');
    }
    if (await this.hasOpenExit(db, input.projectId, input.userId)) {
      motivos.push('SALIDA_EN_CURSO');
    }

    return { elegible: motivos.length === 0, motivos };
  }

  async listLeadershipCandidates(
    tx: Prisma.TransactionClient | undefined,
    input: { projectId: number; liderActualId: number },
  ): Promise<CandidatoElegibilidad[]> {
    const db: Db = tx ?? this.prisma;
    const participaciones = await db.participacionProyecto.findMany({
      where: {
        estadoParticipacion: EstadoParticipacion.ACTIVO,
        rolProyecto: { idProyecto: input.projectId },
      },
      select: {
        usuario: { select: { idUsuario: true, nombre: true, apellido: true, fotoUrl: true } },
      },
    });
    return this.annotate(db, this.dedupe(participaciones), (userId) =>
      this.evaluateLeadershipCandidate(db, {
        projectId: input.projectId,
        userId,
        liderActualId: input.liderActualId,
      }),
    );
  }

  /**
   * Autoasignación a un rol. Conserva las reglas vigentes: idempotencia
   * (quien ya participa activamente no consume cupo otra vez) y cupo real
   * contado bajo el `tx` del caller, nunca leído antes del lock.
   */
  async assertCanSelfAssignRole(
    tx: Prisma.TransactionClient,
    input: SelfAssignRoleInput,
  ): Promise<void> {
    const resultado = await this.evaluateSelfAssignRole(tx, input);
    if (!resultado.elegible) {
      throw new ConflictException({
        statusCode: 409,
        code: 'AUTOASIGNACION_INELEGIBLE',
        message: 'No puedes tomar este rol',
        motivos: resultado.motivos,
      });
    }
  }

  async evaluateSelfAssignRole(db: Db, input: SelfAssignRoleInput): Promise<ResultadoElegibilidad> {
    const motivos: MotivoInelegibilidad[] = [];
    const rol = await db.rolProyecto.findFirst({
      where: { idRolProyecto: input.roleId, idProyecto: input.projectId },
      select: { cupos: true },
    });
    if (!rol) {
      throw new NotFoundException(`Rol de proyecto con id ${input.roleId} no encontrado`);
    }

    const usuario = await this.loadUsuario(db, input.userId);
    if (!usuario) {
      return { elegible: false, motivos: ['USUARIO_NO_EXISTE'] };
    }
    if (usuario.estado !== EstadoUsuario.ACTIVO) {
      motivos.push('USUARIO_DESHABILITADO');
    }

    const yaParticipa = await db.participacionProyecto.findFirst({
      where: {
        idUsuario: input.userId,
        idRolProyecto: input.roleId,
        estadoParticipacion: EstadoParticipacion.ACTIVO,
      },
      select: { idParticipacion: true },
    });
    if (yaParticipa) {
      motivos.push('YA_PARTICIPA_EN_EL_ROL');
    } else {
      const activos = await db.participacionProyecto.count({
        where: { idRolProyecto: input.roleId, estadoParticipacion: EstadoParticipacion.ACTIVO },
      });
      if (activos >= rol.cupos) {
        motivos.push('ROL_SIN_CUPO');
      }
    }

    if (await this.hasOpenExit(db, input.projectId, input.userId)) {
      motivos.push('SALIDA_EN_CURSO');
    }

    return { elegible: motivos.length === 0, motivos };
  }

  private async loadUsuario(db: Db, userId: number) {
    return db.usuario.findUnique({
      where: { idUsuario: userId },
      select: { idUsuario: true, estado: true },
    });
  }

  private async activeParticipations(db: Db, projectId: number, userId: number) {
    return db.participacionProyecto.findMany({
      where: {
        idUsuario: userId,
        estadoParticipacion: EstadoParticipacion.ACTIVO,
        rolProyecto: { idProyecto: projectId },
      },
      select: { idParticipacion: true, idRolProyecto: true },
    });
  }

  /** Una salida abierta es la que todavía puede consumarse: en preparación o esperando al líder. */
  private async hasOpenExit(db: Db, projectId: number, userId: number): Promise<boolean> {
    const abierta = await db.solicitudSalidaProyecto.findFirst({
      where: {
        idProyecto: projectId,
        idUsuario: userId,
        estadoSolicitud: { in: [...ESTADOS_SALIDA_ABIERTA] },
      },
      select: { idSolicitud: true },
    });
    return abierta !== null;
  }

  private dedupe(
    filas: Array<{ usuario: { idUsuario: number; nombre: string; apellido: string; fotoUrl: string | null } }>,
  ) {
    const porUsuario = new Map<number, { idUsuario: number; nombre: string; apellido: string; fotoUrl: string | null }>();
    for (const fila of filas) {
      porUsuario.set(fila.usuario.idUsuario, fila.usuario);
    }
    return [...porUsuario.values()].sort((a, b) => a.idUsuario - b.idUsuario);
  }

  private async annotate(
    _db: Db,
    usuarios: Array<{ idUsuario: number; nombre: string; apellido: string; fotoUrl: string | null }>,
    evaluar: (userId: number) => Promise<ResultadoElegibilidad>,
  ): Promise<CandidatoElegibilidad[]> {
    const anotados: CandidatoElegibilidad[] = [];
    for (const usuario of usuarios) {
      anotados.push({ ...usuario, ...(await evaluar(usuario.idUsuario)) });
    }
    return anotados;
  }
}
