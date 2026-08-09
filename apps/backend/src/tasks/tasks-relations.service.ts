import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Etiqueta, Hito, Prisma, RolProyecto } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TasksContextService } from './tasks-context.service';

type TxClient = Prisma.TransactionClient;

export interface RelatedResourcesInput {
  idHito?: number | null;
  idRolProyecto?: number | null;
  idsEtiquetas?: number[];
}

export interface RelatedResourcesResult {
  hito: Hito | null | undefined;
  rolProyecto: RolProyecto | null | undefined;
  etiquetas: Etiqueta[] | undefined;
}

export interface CreateTaskRelationsInput {
  idHito?: number;
  idRolProyecto?: number;
  idsEtiquetas?: number[];
  idUsuarioAsignado?: number;
}

@Injectable()
export class TasksRelationsService {
  constructor(
    private prisma: PrismaService,
    private tasksContext: TasksContextService,
  ) {}

  /**
   * `undefined` en un campo = el consumidor no pidió validar/tocar esa
   * relación (sin consulta). `null` en idHito/idRolProyecto = ausencia
   * explícita (sin consulta). Un ID numérico delega en TasksContextService,
   * que ya implementa la unicidad de la consulta y el contrato de errores
   * (NotFoundException / BadRequestException); no se duplica esa lógica
   * aquí. Orden: hito, luego rol, luego etiquetas (relevante para las
   * pruebas de secuencia de validaciones).
   */
  async validateRelatedResources(
    projectId: number,
    input: RelatedResourcesInput,
    tx?: TxClient,
  ): Promise<RelatedResourcesResult> {
    let hito: Hito | null | undefined;
    if (input.idHito === undefined) {
      hito = undefined;
    } else if (input.idHito === null) {
      hito = null;
    } else {
      hito = await this.tasksContext.getMilestoneInProjectOrThrow(projectId, input.idHito, tx);
    }

    let rolProyecto: RolProyecto | null | undefined;
    if (input.idRolProyecto === undefined) {
      rolProyecto = undefined;
    } else if (input.idRolProyecto === null) {
      rolProyecto = null;
    } else {
      rolProyecto = await this.tasksContext.getRoleInProjectOrThrow(
        projectId,
        input.idRolProyecto,
        tx,
      );
    }

    const etiquetas =
      input.idsEtiquetas === undefined
        ? undefined
        : await this.tasksContext.getLabelsInProjectOrThrow(projectId, input.idsEtiquetas, tx);

    return { hito, rolProyecto, etiquetas };
  }

  /**
   * roleId es el rol EFECTIVO de la tarea, ya resuelto por el consumidor
   * (número o null explícito; nunca undefined). El líder no queda exento:
   * la excepción de assertActiveProjectParticipant que permite leer sin
   * fila de participación no aplica aquí — asignar exige participación
   * real, con o sin rol según corresponda. Tarea.creadaPor nunca se
   * consulta ni interviene.
   *
   * Invocación pública e independiente: siempre valida el rol por su
   * cuenta (vía TasksContextService), sin confiar en que un llamador ya
   * lo haya hecho. validateCreateTaskRelations NO pasa por este método
   * cuando ya validó el rol — reutiliza directamente los helpers privados
   * de abajo para evitar la segunda consulta del mismo rol.
   */
  async assertUserAssignableToProject(
    projectId: number,
    userId: number,
    roleId: number | null,
    tx?: TxClient,
  ): Promise<void> {
    await this.assertUserExists(userId, tx);

    if (roleId !== null) {
      await this.tasksContext.getRoleInProjectOrThrow(projectId, roleId, tx);
    }

    await this.assertUserParticipationForEffectiveRole(projectId, userId, roleId, tx);
  }

  private async assertUserExists(userId: number, tx?: TxClient): Promise<void> {
    const db = tx ?? this.prisma;
    const usuario = await db.usuario.findUnique({
      where: { idUsuario: userId },
      select: { idUsuario: true },
    });
    if (!usuario) {
      throw new NotFoundException(`Usuario con id ${userId} no encontrado`);
    }
  }

  /**
   * Únicamente la consulta de participación para el rol efectivo dado —
   * no valida la existencia del rol ni del usuario. roleId numérico exige
   * participación ACTIVO en ese rol exacto; roleId null exige cualquier
   * participación ACTIVO dentro del proyecto.
   */
  private async assertUserParticipationForEffectiveRole(
    projectId: number,
    userId: number,
    roleId: number | null,
    tx?: TxClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;

    if (roleId !== null) {
      const participacionConRol = await db.participacionProyecto.findFirst({
        where: {
          idUsuario: userId,
          idRolProyecto: roleId,
          estadoParticipacion: 'ACTIVO',
          rolProyecto: { idProyecto: projectId },
        },
        select: { idParticipacion: true },
      });
      if (!participacionConRol) {
        throw new BadRequestException(
          'El usuario no tiene una participación activa en el rol de la tarea',
        );
      }
      return;
    }

    const participacionEnProyecto = await db.participacionProyecto.findFirst({
      where: {
        idUsuario: userId,
        estadoParticipacion: 'ACTIVO',
        rolProyecto: { idProyecto: projectId },
      },
      select: { idParticipacion: true },
    });
    if (!participacionEnProyecto) {
      throw new BadRequestException('El usuario no tiene una participación activa en el proyecto');
    }
  }

  /**
   * Orquesta la validación completa para creación: hito, rol y etiquetas
   * primero (vía validateRelatedResources — el rol se consulta aquí, una
   * sola vez), y solo si se solicitó asignar a alguien, la existencia del
   * usuario y su participación para idRolProyecto ?? null como rol
   * efectivo, reutilizando el rol ya validado sin volver a llamar a
   * getRoleInProjectOrThrow. No crea nada; solo valida y devuelve los
   * recursos ya resueltos para que la Tarea 18 los reutilice.
   */
  async validateCreateTaskRelations(
    projectId: number,
    input: CreateTaskRelationsInput,
    tx?: TxClient,
  ): Promise<RelatedResourcesResult> {
    const recursos = await this.validateRelatedResources(
      projectId,
      {
        idHito: input.idHito,
        idRolProyecto: input.idRolProyecto,
        idsEtiquetas: input.idsEtiquetas,
      },
      tx,
    );

    if (input.idUsuarioAsignado !== undefined) {
      await this.assertUserExists(input.idUsuarioAsignado, tx);

      const rolEfectivo = input.idRolProyecto ?? null;
      await this.assertUserParticipationForEffectiveRole(
        projectId,
        input.idUsuarioAsignado,
        rolEfectivo,
        tx,
      );
    }

    return recursos;
  }
}
