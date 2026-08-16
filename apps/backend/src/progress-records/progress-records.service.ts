import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TasksContextService } from '../tasks/tasks-context.service';
import { CreateProgressRecordDto } from './dto/create-progress-record.dto';
import { UpdateProgressRecordDto } from './dto/update-progress-record.dto';

const MIN_PROGRESS_CONTENT_LENGTH = 200;

@Injectable()
export class ProgressRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasksContext: TasksContextService,
  ) {}

  async create(
    projectId: number,
    taskId: number,
    assignmentId: number,
    userId: number,
    dto: CreateProgressRecordDto,
  ) {
    this.assertContenidoValido(dto.contenido);
    await this.tasksContext.getTaskInProjectOrThrow(projectId, taskId);
    const asignacion = await this.getAssignmentInTaskOrThrow(taskId, assignmentId);

    if (asignacion.idUsuario !== userId) {
      throw new ForbiddenException('Solo el usuario asignado puede registrar avance en este tramo');
    }

    await this.tasksContext.assertActiveProjectParticipant(projectId, userId);

    return this.prisma.registroAvanceAsignacion.create({
      data: {
        idAsignacion: assignmentId,
        idAutor: userId,
        contenido: dto.contenido,
      },
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
    await this.tasksContext.getTaskInProjectOrThrow(projectId, taskId);
    await this.getAssignmentInTaskOrThrow(taskId, assignmentId);
    const registro = await this.getProgressRecordInAssignmentOrThrow(assignmentId, progressRecordId);

    if (registro.idAutor !== userId) {
      throw new ForbiddenException('Solo el autor puede editar este registro de avance');
    }

    await this.tasksContext.assertActiveProjectParticipant(projectId, userId);

    return this.prisma.registroAvanceAsignacion.update({
      where: { idRegistroAvance: progressRecordId },
      data: { contenido: dto.contenido, editadoEn: new Date() },
    });
  }

  private assertContenidoValido(contenido: string): void {
    if (typeof contenido !== 'string' || contenido.trim().length < MIN_PROGRESS_CONTENT_LENGTH) {
      throw new BadRequestException(
        `contenido debe tener al menos ${MIN_PROGRESS_CONTENT_LENGTH} caracteres significativos`,
      );
    }
  }

  private async getAssignmentInTaskOrThrow(taskId: number, assignmentId: number) {
    const asignacion = await this.prisma.asignacionTarea.findFirst({
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

  private async getProgressRecordInAssignmentOrThrow(assignmentId: number, progressRecordId: number) {
    const registro = await this.prisma.registroAvanceAsignacion.findFirst({
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
