import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type TxClient = Prisma.TransactionClient;

const ESTADOS_SPRINT_OPERABLE = ['ACTIVO', 'EN_FINALIZACION'] as const;

@Injectable()
export class SprintsContextService {
  constructor(private prisma: PrismaService) {}

  /**
   * Reproduce exactamente TasksContextService.getProjectOrThrow: liderazgo =
   * Proyecto.creadoPor === userId, sin tabla ni rol distinto de "líder".
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

  async assertProjectLeader(projectId: number, userId: number, tx?: TxClient): Promise<void> {
    const proyecto = await this.getProjectOrThrow(projectId, tx);
    if (proyecto.creadoPor !== userId) {
      throw new ForbiddenException('No eres el líder de este proyecto');
    }
  }

  /**
   * Sprint operable = ACTIVO o EN_FINALIZACION (Foundation, enum
   * EstadoSprint). CERRADO nunca se considera Sprint actual. Devuelve null
   * si el proyecto no tiene ninguno, sin lanzar excepción, igual que
   * TasksContextService.getActiveAssignment.
   */
  async getCurrentSprint(projectId: number, tx?: TxClient) {
    const db = tx ?? this.prisma;
    return db.sprint.findFirst({
      where: {
        idProyecto: projectId,
        estado: { in: [...ESTADOS_SPRINT_OPERABLE] },
      },
    });
  }

  /**
   * Consulta única con idSprint + idProyecto, para no revelar mediante dos
   * pasos que un Sprint existe en otro proyecto (mismo patrón que
   * TasksContextService.getTaskInProjectOrThrow). Sprint no tiene columna de
   * soft delete en el schema actual.
   */
  async getSprintInProjectOrThrow(projectId: number, sprintId: number, tx?: TxClient) {
    const db = tx ?? this.prisma;
    const sprint = await db.sprint.findFirst({
      where: { idSprint: sprintId, idProyecto: projectId },
    });
    if (!sprint) {
      throw new NotFoundException(
        `Sprint con id ${sprintId} no encontrado en el proyecto ${projectId}`,
      );
    }
    return sprint;
  }
}
