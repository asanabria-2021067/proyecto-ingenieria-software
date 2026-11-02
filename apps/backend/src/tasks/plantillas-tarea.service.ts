import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectTransactionService } from '../common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../common/project-policy/project-policy.service';
import { ProjectReadPolicyService } from '../common/project-policy/project-read-policy.service';
import { TasksAuthorizationService } from './tasks-authorization.service';
import { TasksContextService } from './tasks-context.service';
import { lockedProject } from './tasks-writes.helpers';
import type { CreatePlantillaTareaDto } from './dto/plantilla-tarea.dto';

export const MAX_PLANTILLAS_POR_PROYECTO = 30;

/** MEJ-52: plantillas de tarea. Las ve quien puede leer el tablero; las crea y borra solo el lider. */
@Injectable()
export class PlantillasTareaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: TasksAuthorizationService,
    private readonly context: TasksContextService,
    private readonly projectTx: ProjectTransactionService,
    private readonly policy: ProjectPolicyService,
    private readonly readPolicy: ProjectReadPolicyService,
  ) {}

  async list(projectId: number, userId: number) {
    await this.readPolicy.assertRead(undefined, { projectId, actorId: userId, scope: 'tareas' });
    await this.authorization.assertCanListProjectTasks(projectId, userId);
    return this.prisma.plantillaTarea.findMany({
      where: { idProyecto: projectId },
      orderBy: { nombre: 'asc' },
    });
  }

  create(projectId: number, userId: number, dto: CreatePlantillaTareaDto) {
    return this.projectTx.run(projectId, userId, 'plantillas-tarea.create', async (ctx) => {
      const { tx } = ctx;
      await this.context.assertProjectLeader(projectId, userId, tx);
      await this.policy.assertWriteTx(tx, lockedProject(ctx), 'ETIQUETA_CRUD', userId);
      // El lock del proyecto serializa el conteo con el create.
      const cantidad = await tx.plantillaTarea.count({ where: { idProyecto: projectId } });
      if (cantidad >= MAX_PLANTILLAS_POR_PROYECTO) {
        throw new ConflictException(`El proyecto admite hasta ${MAX_PLANTILLAS_POR_PROYECTO} plantillas`);
      }
      return tx.plantillaTarea.create({
        data: {
          idProyecto: projectId,
          nombre: dto.nombre,
          tituloTarea: dto.tituloTarea,
          descripcionTarea: dto.descripcionTarea ?? null,
          prioridad: dto.prioridad,
          tiempoEstimadoHoras: dto.tiempoEstimadoHoras ?? null,
          checklist: dto.checklist ?? [],
          creadaPor: userId,
        },
      });
    });
  }

  async remove(projectId: number, plantillaId: number, userId: number): Promise<void> {
    await this.projectTx.run(projectId, userId, 'plantillas-tarea.remove', async (ctx) => {
      const { tx } = ctx;
      await this.context.assertProjectLeader(projectId, userId, tx);
      await this.policy.assertWriteTx(tx, lockedProject(ctx), 'ETIQUETA_CRUD', userId);
      const { count } = await tx.plantillaTarea.deleteMany({
        where: { idPlantilla: plantillaId, idProyecto: projectId },
      });
      if (count === 0) throw new NotFoundException(`Plantilla ${plantillaId} no encontrada en el proyecto ${projectId}`);
    });
  }
}
