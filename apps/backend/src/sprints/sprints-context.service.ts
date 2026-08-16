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

  /**
   * A8: variante de `getSprintInProjectOrThrow` que además resuelve
   * `Proyecto.creadoPor` (y su soft-delete) en la MISMA consulta, vía
   * `include`, para que la autorización del resumen de cierre pueda validar
   * liderazgo sin una segunda consulta — el read-model de A8 tiene un
   * presupuesto de ≤2 queries totales por invocación (esta + la agregación),
   * así que no puede pagar el costo de dos consultas separadas
   * (`getSprintInProjectOrThrow` + `assertProjectLeader`) como hacen
   * finalizar/cerrar/ajustar horas. Mismo criterio de "no encontrado" que
   * `getProjectOrThrow` (proyecto soft-deleted = 404), replicado aquí para
   * no divergir del resto del módulo.
   */
  async getSprintWithProjectOrThrow(projectId: number, sprintId: number, tx?: TxClient) {
    const db = tx ?? this.prisma;
    const sprint = await db.sprint.findFirst({
      where: { idSprint: sprintId, idProyecto: projectId },
      include: { proyecto: { select: { creadoPor: true, eliminadoEn: true } } },
    });
    if (!sprint || sprint.proyecto.eliminadoEn !== null) {
      throw new NotFoundException(
        `Sprint con id ${sprintId} no encontrado en el proyecto ${projectId}`,
      );
    }
    return sprint;
  }
}
