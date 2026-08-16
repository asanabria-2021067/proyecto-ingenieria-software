import { ConflictException, Injectable } from '@nestjs/common';
import { EstadoSprint, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SprintsContextService } from './sprints-context.service';
import { SprintsAuthorizationService } from './sprints-authorization.service';

@Injectable()
export class SprintsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sprintsContext: SprintsContextService,
    private readonly sprintsAuthorization: SprintsAuthorizationService,
  ) {}

  /**
   * Inicia el Sprint manualmente: exclusivo del líder (contrato A1), y solo
   * si el proyecto no tiene ya un Sprint operable (ACTIVO o
   * EN_FINALIZACION) — CERRADO nunca bloquea. Todo ocurre dentro de una
   * transacción: la comprobación de "sin Sprint operable" dentro de la
   * transacción reduce la ventana de carrera, pero la garantía real contra
   * dos inicios concurrentes es el índice único parcial
   * `sprint_operable_unique` (Foundation) sobre (idProyecto) WHERE estado
   * IN (ACTIVO, EN_FINALIZACION): el segundo `create` que intente violarlo
   * recibe P2002, que aquí se traduce a ConflictException en vez de dejar
   * escapar el error crudo de Prisma (mismo patrón que
   * TasksService.createActiveAssignment /
   * ProjectsService.isPendingExitRequestCollision).
   *
   * numero = MAX(numero) + 1 por proyecto (1 si nunca existió un Sprint).
   * No existe un constraint de unicidad de (idProyecto, numero) en
   * Foundation, pero no es necesario: todo `create` de este método fija
   * estado=ACTIVO, así que cualquier segunda inserción concurrente para el
   * mismo proyecto siempre colisiona primero contra
   * `sprint_operable_unique` (single-column, sobre idProyecto) antes de que
   * un posible número duplicado pudiera materializarse en una fila
   * persistida.
   */
  async startSprint(projectId: number, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      await this.sprintsAuthorization.assertCanStartSprint(projectId, userId, tx);

      const sprintOperable = await this.sprintsContext.getCurrentSprint(projectId, tx);
      if (sprintOperable) {
        throw new ConflictException(
          'Ya existe un Sprint activo o en finalización para este proyecto',
        );
      }

      const ultimoSprint = await tx.sprint.findFirst({
        where: { idProyecto: projectId },
        orderBy: { numero: 'desc' },
        select: { numero: true },
      });
      const siguienteNumero = (ultimoSprint?.numero ?? 0) + 1;

      try {
        return await tx.sprint.create({
          data: {
            idProyecto: projectId,
            numero: siguienteNumero,
            estado: EstadoSprint.ACTIVO,
          },
        });
      } catch (error) {
        if (this.isOperableSprintCollision(error)) {
          throw new ConflictException(
            'Ya existe un Sprint activo o en finalización para este proyecto',
          );
        }
        throw error;
      }
    });
  }

  /**
   * Reconoce específicamente la violación del índice parcial
   * `sprint_operable_unique` (idProyecto), mismo criterio estrecho que
   * TasksService.isActiveAssignmentCollision: no basta `code === 'P2002'`,
   * se exige además modelo Sprint y target exactamente ['id_proyecto'].
   * Cualquier otro P2002 (u otro código) se relanza sin cambios.
   */
  private isOperableSprintCollision(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
      return false;
    }
    if (error.code !== 'P2002') {
      return false;
    }

    const modelName = error.meta?.modelName;
    const target = error.meta?.target;

    return (
      modelName === 'Sprint' &&
      Array.isArray(target) &&
      target.length === 1 &&
      target[0] === 'id_proyecto'
    );
  }
}
