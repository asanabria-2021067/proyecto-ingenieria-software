import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TasksContextService } from './tasks-context.service';

type TxClient = Prisma.TransactionClient;

@Injectable()
export class TasksAuthorizationService {
  constructor(private readonly tasksContext: TasksContextService) {}

  /**
   * Crear tarea: cualquier miembro con participación activa en el proyecto
   * (el líder siempre cuenta como tal). No hay tarea todavía que devolver ni
   * asignación que comprobar.
   */
  async assertCanCreateTask(projectId: number, userId: number, tx?: TxClient): Promise<void> {
    await this.tasksContext.assertActiveProjectParticipant(projectId, userId, tx);
  }

  /** Editar tarea: exclusivo del líder. */
  async assertCanEditTask(projectId: number, taskId: number, userId: number, tx?: TxClient) {
    return this._requireTaskAndLeadership(projectId, taskId, userId, tx);
  }

  /**
   * Asignar tarea: exclusivo del líder. Solo autoriza al actor que solicita
   * la operación; el usuario que será asignado se valida en otra capa.
   */
  async assertCanAssignTask(projectId: number, taskId: number, userId: number, tx?: TxClient) {
    return this._requireTaskAndLeadership(projectId, taskId, userId, tx);
  }

  /**
   * Desasignar tarea: mismas reglas de liderazgo que asignar. El usuario
   * actualmente asignado no puede desasignarse a sí mismo mediante esta
   * regla (no hay ninguna excepción para el asignado activo aquí).
   */
  async assertCanUnassignTask(projectId: number, taskId: number, userId: number, tx?: TxClient) {
    return this._requireTaskAndLeadership(projectId, taskId, userId, tx);
  }

  /** Eliminar tarea: exclusivo del líder. */
  async assertCanDeleteTask(projectId: number, taskId: number, userId: number, tx?: TxClient) {
    return this._requireTaskAndLeadership(projectId, taskId, userId, tx);
  }

  /**
   * Cambiar estado: permitido al líder o al asignado activo. La asignación
   * se consulta en cada invocación (nunca se cachea ni se recibe del
   * llamador), y solo cuenta la fila con desasignadaEn: null que devuelve
   * TasksContextService.getActiveAssignment.
   */
  async assertCanChangeTaskState(
    projectId: number,
    taskId: number,
    userId: number,
    tx?: TxClient,
  ) {
    const tarea = await this.tasksContext.getTaskInProjectOrThrow(projectId, taskId, tx);
    const proyecto = await this.tasksContext.getProjectOrThrow(projectId, tx);

    if (proyecto.creadoPor === userId) {
      return tarea;
    }

    const asignacionActiva = await this.tasksContext.getActiveAssignment(taskId, tx);
    if (asignacionActiva && asignacionActiva.idUsuario === userId) {
      return tarea;
    }

    throw new ForbiddenException('No tienes permiso para realizar esta acción sobre la tarea');
  }

  /** Listar tareas: líder o participante activo, sin cambiar esa semántica. */
  async assertCanListProjectTasks(
    projectId: number,
    userId: number,
    tx?: TxClient,
  ): Promise<void> {
    await this.tasksContext.assertActiveProjectParticipant(projectId, userId, tx);
  }

  /**
   * Leer una tarea: se valida primero la tarea (para tratar una tarea de
   * otro proyecto como inexistente antes de evaluar permisos) y luego se
   * exige liderazgo o participación activa. El rol de la tarea no
   * restringe la lectura.
   */
  async assertCanReadTask(projectId: number, taskId: number, userId: number, tx?: TxClient) {
    const tarea = await this.tasksContext.getTaskInProjectOrThrow(projectId, taskId, tx);
    await this.tasksContext.assertActiveProjectParticipant(projectId, userId, tx);
    return tarea;
  }

  /** Comentar una tarea: misma regla que leer una tarea. */
  async assertCanCommentTask(projectId: number, taskId: number, userId: number, tx?: TxClient) {
    const tarea = await this.tasksContext.getTaskInProjectOrThrow(projectId, taskId, tx);
    await this.tasksContext.assertActiveProjectParticipant(projectId, userId, tx);
    return tarea;
  }

  /**
   * Secuencia compartida por editar/asignar/desasignar/eliminar: validar la
   * tarea dentro del proyecto y luego exigir liderazgo, en ese orden.
   */
  private async _requireTaskAndLeadership(
    projectId: number,
    taskId: number,
    userId: number,
    tx?: TxClient,
  ) {
    const tarea = await this.tasksContext.getTaskInProjectOrThrow(projectId, taskId, tx);
    await this.tasksContext.assertProjectLeader(projectId, userId, tx);
    return tarea;
  }
}
