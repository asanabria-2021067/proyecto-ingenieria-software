import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type TxClient = Prisma.TransactionClient;

@Injectable()
export class TasksContextService {
  constructor(private prisma: PrismaService) {}

  /**
   * Liderazgo = Proyecto.creadoPor === userId, reproduciendo exactamente la
   * regla ya usada en ProjectsService._requireOwner y en
   * ComentariosService.assertChannelA*Allowed. No existe un rol o tabla
   * distinta de "líder" en el schema actual.
   */
  async getProjectOrThrow(projectId: number, tx?: TxClient) {
    const db = tx ?? this.prisma;
    const proyecto = await db.proyecto.findFirst({
      where: { idProyecto: projectId, eliminadoEn: null },
    });
    if (!proyecto) {
      throw new NotFoundException(`Proyecto con id ${projectId} no encontrado`);
    }
    return proyecto;
  }

  /**
   * Consulta única con idTarea + idProyecto + eliminadoEn: null, para no
   * revelar mediante dos pasos que una tarea existe en otro proyecto.
   */
  async getTaskInProjectOrThrow(projectId: number, taskId: number, tx?: TxClient) {
    const db = tx ?? this.prisma;
    const tarea = await db.tarea.findFirst({
      where: { idTarea: taskId, idProyecto: projectId, eliminadoEn: null },
    });
    if (!tarea) {
      throw new NotFoundException(
        `Tarea con id ${taskId} no encontrada en el proyecto ${projectId}`,
      );
    }
    return tarea;
  }

  /**
   * La garantía de "máximo una asignación activa por tarea" la impone el
   * índice único parcial asignacion_tarea_activa_unique (Tarea 9); aquí solo
   * se filtra por desasignadaEn: null, sin asumir que la fila más reciente
   * por fecha es la activa.
   */
  async getActiveAssignment(taskId: number, tx?: TxClient) {
    const db = tx ?? this.prisma;
    return db.asignacionTarea.findFirst({
      where: { idTarea: taskId, desasignadaEn: null },
    });
  }

  async assertProjectLeader(projectId: number, userId: number, tx?: TxClient): Promise<void> {
    const proyecto = await this.getProjectOrThrow(projectId, tx);
    if (proyecto.creadoPor !== userId) {
      throw new ForbiddenException('No eres el líder de este proyecto');
    }
  }

  /**
   * Reproduce el comportamiento real ya existente en
   * ComentariosService.assertChannelA*Allowed: el líder se considera
   * participante sin necesitar una fila en ParticipacionProyecto; cualquier
   * otro usuario requiere una participación con estadoParticipacion: ACTIVO
   * en algún rol del proyecto (ParticipacionProyecto no tiene idProyecto
   * directo, por lo que se filtra vía la relación rolProyecto.idProyecto).
   */
  async assertActiveProjectParticipant(
    projectId: number,
    userId: number,
    tx?: TxClient,
  ): Promise<void> {
    const proyecto = await this.getProjectOrThrow(projectId, tx);
    if (proyecto.creadoPor === userId) {
      return;
    }

    const db = tx ?? this.prisma;
    const participacion = await db.participacionProyecto.findFirst({
      where: {
        idUsuario: userId,
        estadoParticipacion: 'ACTIVO',
        rolProyecto: { idProyecto: projectId },
      },
      select: { idParticipacion: true },
    });
    if (!participacion) {
      throw new ForbiddenException('No tienes una participación activa en este proyecto');
    }
  }

  /**
   * Hito no tiene soft delete en el schema actual (sin columna eliminadoEn),
   * por lo que no se aplica ningún filtro de eliminación: solo existencia y
   * pertenencia al proyecto.
   */
  async getMilestoneInProjectOrThrow(projectId: number, milestoneId: number, tx?: TxClient) {
    const db = tx ?? this.prisma;
    const hito = await db.hito.findUnique({ where: { idHito: milestoneId } });
    if (!hito) {
      throw new NotFoundException(`Hito con id ${milestoneId} no encontrado`);
    }
    if (hito.idProyecto !== projectId) {
      throw new BadRequestException(`El hito con id ${milestoneId} pertenece a otro proyecto`);
    }
    return hito;
  }

  /**
   * RolProyecto tampoco tiene soft delete en el schema actual.
   */
  async getRoleInProjectOrThrow(projectId: number, roleId: number, tx?: TxClient) {
    const db = tx ?? this.prisma;
    const rol = await db.rolProyecto.findUnique({ where: { idRolProyecto: roleId } });
    if (!rol) {
      throw new NotFoundException(`Rol de proyecto con id ${roleId} no encontrado`);
    }
    if (rol.idProyecto !== projectId) {
      throw new BadRequestException(`El rol con id ${roleId} pertenece a otro proyecto`);
    }
    return rol;
  }

  /**
   * Una sola consulta por conjunto (findMany con idEtiqueta: { in: labelIds
   * }), procesada en memoria para distinguir etiquetas inexistentes de
   * etiquetas de otro proyecto. El resultado se reordena según labelIds
   * porque findMany no garantiza el orden de entrada.
   */
  async getLabelsInProjectOrThrow(projectId: number, labelIds: number[], tx?: TxClient) {
    if (labelIds.length === 0) {
      return [];
    }

    const uniqueIds = new Set(labelIds);
    if (uniqueIds.size !== labelIds.length) {
      throw new BadRequestException('idsEtiquetas contiene valores duplicados');
    }

    const db = tx ?? this.prisma;
    const etiquetas = await db.etiqueta.findMany({
      where: { idEtiqueta: { in: labelIds } },
    });
    const etiquetasPorId = new Map(etiquetas.map((etiqueta) => [etiqueta.idEtiqueta, etiqueta]));

    const faltantes = labelIds.filter((id) => !etiquetasPorId.has(id));
    if (faltantes.length > 0) {
      throw new NotFoundException(
        `Etiqueta(s) con id ${faltantes.join(', ')} no encontrada(s)`,
      );
    }

    const deOtroProyecto = labelIds.filter(
      (id) => etiquetasPorId.get(id)!.idProyecto !== projectId,
    );
    if (deOtroProyecto.length > 0) {
      throw new BadRequestException(
        `Etiqueta(s) con id ${deOtroProyecto.join(', ')} pertenece(n) a otro proyecto`,
      );
    }

    return labelIds.map((id) => etiquetasPorId.get(id)!);
  }
}
