import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SprintsContextService } from './sprints-context.service';

type TxClient = Prisma.TransactionClient;

@Injectable()
export class SprintsAuthorizationService {
  constructor(private readonly sprintsContext: SprintsContextService) {}

  /**
   * Iniciar Sprint: exclusivo del líder del proyecto. Todavía no existe el
   * Sprint a validar (numeración y creación son A2), por lo que solo se
   * exige liderazgo sobre el proyecto.
   */
  async assertCanStartSprint(projectId: number, userId: number, tx?: TxClient): Promise<void> {
    await this.sprintsContext.assertProjectLeader(projectId, userId, tx);
  }

  /** Finalizar Sprint: exclusivo del líder. */
  async assertCanFinalizeSprint(
    projectId: number,
    sprintId: number,
    userId: number,
    tx?: TxClient,
  ) {
    return this._requireSprintAndLeadership(projectId, sprintId, userId, tx);
  }

  /** Cerrar Sprint: exclusivo del líder. */
  async assertCanCloseSprint(projectId: number, sprintId: number, userId: number, tx?: TxClient) {
    return this._requireSprintAndLeadership(projectId, sprintId, userId, tx);
  }

  /** Ajustar horas reconocidas (A7): exclusivo del líder, parte de la gestión del Sprint. */
  async assertCanAdjustRecognizedHours(
    projectId: number,
    sprintId: number,
    userId: number,
    tx?: TxClient,
  ) {
    return this._requireSprintAndLeadership(projectId, sprintId, userId, tx);
  }

  /**
   * Secuencia compartida por finalizar/cerrar: validar el Sprint dentro del
   * proyecto y luego exigir liderazgo, en ese orden (mismo patrón que
   * TasksAuthorizationService._requireTaskAndLeadership).
   */
  private async _requireSprintAndLeadership(
    projectId: number,
    sprintId: number,
    userId: number,
    tx?: TxClient,
  ) {
    const sprint = await this.sprintsContext.getSprintInProjectOrThrow(projectId, sprintId, tx);
    await this.sprintsContext.assertProjectLeader(projectId, userId, tx);
    return sprint;
  }
}
