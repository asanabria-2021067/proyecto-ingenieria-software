import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TasksContextService } from '../tasks/tasks-context.service';
import {
  ProjectTransactionService,
  type ProjectLockRow,
  type ProjectTransactionContext,
} from '../common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../common/project-policy/project-policy.service';
import { CreateProgressRecordDto } from './dto/create-progress-record.dto';
import { UpdateProgressRecordDto } from './dto/update-progress-record.dto';

const MIN_PROGRESS_CONTENT_LENGTH = 200;

type Db = Prisma.TransactionClient | PrismaService;

/**
 * C042 (06 v2 §32/§40): crear y editar un avance corren dentro del runner por
 * proyecto con la familia `AVANCE` (propietario del tramo, proyecto P/E,
 * Sprint ambiente ACTIVO) y, tras el lock, con el Sprint de la tarea como
 * entidad ACTIVO: un avance no puede escribirse contra un Sprint histórico.
 * La regla de contenido (≥ 200 caracteres significativos) y el DTO no cambian.
 */
@Injectable()
export class ProgressRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasksContext: TasksContextService,
    private readonly projectTx: ProjectTransactionService,
    private readonly policy: ProjectPolicyService,
  ) {}

  private lockedProject(ctx: Pick<ProjectTransactionContext, 'project'>): ProjectLockRow {
    if (!ctx.project) {
      throw new NotFoundException('Proyecto no encontrado');
    }
    return ctx.project;
  }

  async create(
    projectId: number,
    taskId: number,
    assignmentId: number,
    userId: number,
    dto: CreateProgressRecordDto,
  ) {
    this.assertContenidoValido(dto.contenido);

    return this.projectTx.run(projectId, userId, 'progress-records.create', async (ctx) => {
      const { tx } = ctx;
      const tarea = await this.tasksContext.getTaskInProjectOrThrow(projectId, taskId, tx);
      const asignacion = await this.getAssignmentInTaskOrThrow(taskId, assignmentId, tx);

      if (asignacion.idUsuario !== userId) {
        throw new ForbiddenException('Solo el usuario asignado puede registrar avance en este tramo');
      }

      await this.tasksContext.assertActiveProjectParticipant(projectId, userId, tx);
      await this.policy.assertWriteTx(tx, this.lockedProject(ctx), 'AVANCE', userId, {
        sprintId: tarea?.idSprint ?? null,
      });

      return tx.registroAvanceAsignacion.create({
        data: {
          idAsignacion: assignmentId,
          idAutor: userId,
          contenido: dto.contenido,
        },
      });
    });
  }

  async update(
    projectId: number,
    taskId: number,
    assignmentId: number,
    progressRecordId: number,
    userId: number,
    dto: UpdateProgressRecordDto,
  ) {
    this.assertContenidoValido(dto.contenido);

    return this.projectTx.run(projectId, userId, 'progress-records.update', async (ctx) => {
      const { tx } = ctx;
      const tarea = await this.tasksContext.getTaskInProjectOrThrow(projectId, taskId, tx);
      await this.getAssignmentInTaskOrThrow(taskId, assignmentId, tx);
      const registro = await this.getProgressRecordInAssignmentOrThrow(
        assignmentId,
        progressRecordId,
        tx,
      );

      if (registro.idAutor !== userId) {
        throw new ForbiddenException('Solo el autor puede editar este registro de avance');
      }

      await this.tasksContext.assertActiveProjectParticipant(projectId, userId, tx);
      await this.policy.assertWriteTx(tx, this.lockedProject(ctx), 'AVANCE', userId, {
        sprintId: tarea?.idSprint ?? null,
      });

      return tx.registroAvanceAsignacion.update({
        where: { idRegistroAvance: progressRecordId },
        data: { contenido: dto.contenido, editadoEn: new Date() },
      });
    });
  }

  private assertContenidoValido(contenido: string): void {
    if (typeof contenido !== 'string' || contenido.trim().length < MIN_PROGRESS_CONTENT_LENGTH) {
      throw new BadRequestException(
        `contenido debe tener al menos ${MIN_PROGRESS_CONTENT_LENGTH} caracteres significativos`,
      );
    }
  }

  private async getAssignmentInTaskOrThrow(taskId: number, assignmentId: number, db: Db = this.prisma) {
    const asignacion = await db.asignacionTarea.findFirst({
      where: { idAsignacion: assignmentId, idTarea: taskId },
      select: { idAsignacion: true, idTarea: true, idUsuario: true },
    });
    if (!asignacion) {
      throw new NotFoundException(
        `Asignación con id ${assignmentId} no encontrada en la tarea ${taskId}`,
      );
    }
    return asignacion;
  }

  private async getProgressRecordInAssignmentOrThrow(
    assignmentId: number,
    progressRecordId: number,
    db: Db = this.prisma,
  ) {
    const registro = await db.registroAvanceAsignacion.findFirst({
      where: { idRegistroAvance: progressRecordId, idAsignacion: assignmentId },
      select: { idRegistroAvance: true, idAsignacion: true, idAutor: true },
    });
    if (!registro) {
      throw new NotFoundException(
        `Registro de avance con id ${progressRecordId} no encontrado en la asignación ${assignmentId}`,
      );
    }
    return registro;
  }
}
