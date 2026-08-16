import { ForbiddenException, Injectable } from '@nestjs/common';
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
   * Ver resumen de cierre del Sprint (A8): exclusivo del líder, misma regla
   * de acceso que gestionar el Sprint (finalizar/cerrar/ajustar horas). A
   * diferencia de `_requireSprintAndLeadership` (2 queries: Sprint + Proyecto
   * por separado), resuelve Sprint+liderazgo en UNA sola consulta vía
   * `SprintsContextService.getSprintWithProjectOrThrow` — el read-model de
   * A8 tiene un presupuesto de ≤2 queries totales por invocación.
   */
  async assertCanViewClosingSummary(
    projectId: number,
    sprintId: number,
    userId: number,
    tx?: TxClient,
  ) {
    const sprint = await this.sprintsContext.getSprintWithProjectOrThrow(projectId, sprintId, tx);
    if (sprint.proyecto.creadoPor !== userId) {
      throw new ForbiddenException('No eres el líder de este proyecto');
    }
    return sprint;
  }

  /**
   * Listar histórico de Sprints del proyecto (A10): exclusivo del líder,
   * misma política de lectura que el resto de `sprints/` (ninguna operación
   * del módulo es visible para participantes no-líder todavía) — no se
   * introduce una política funcional nueva. Solo exige liderazgo sobre el
   * proyecto porque el listado no tiene un Sprint concreto que validar.
   */
  async assertCanListSprintHistory(projectId: number, userId: number, tx?: TxClient): Promise<void> {
    await this.sprintsContext.assertProjectLeader(projectId, userId, tx);
  }

  /**
   * Ver detalle histórico de un Sprint (A10): exclusivo del líder, mismo
   * patrón que finalizar/cerrar/ajustar horas — Sprint+liderazgo validados
   * juntos vía `_requireSprintAndLeadership`.
   */
  async assertCanViewSprintHistory(
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
