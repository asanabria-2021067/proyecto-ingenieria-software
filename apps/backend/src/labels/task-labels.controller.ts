import {
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { LabelsService } from './labels.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ProjectWriteGuard } from '../common/guards/project-write.guard';
import { ProjectWrite, type ProjectWriteMetadata } from '../common/guards/project-write.metadata';

/**
 * C035 (06 v2 §32/§41 E026–E027): metadata explícita por handler. El proyecto
 * se resuelve desde `params.projectId`; las etiquetas de tarea solo operan en
 * P/E con Sprint `ACTIVO`, y la tarea afectada debe pertenecer a un Sprint
 * ACTIVO (exigencia de entidad, verificada en el servicio bajo el lock).
 */
const TASK_LABEL_WRITE: ProjectWriteMetadata = {
  source: { kind: 'param', name: 'projectId' },
  states: ['P', 'E'],
  sprint: 'ACTIVO',
  family: 'ETIQUETA_TAREA',
};

/**
 * Tarea 32: asociación/retirada de una etiqueta existente a una tarea
 * existente, ambas contextualizadas por el mismo proyecto. Prefijo propio
 * (no el de LabelsController) porque la relación cuelga de una tarea, no
 * del proyecto directamente. Sin body/DTO: los tres IDs de ruta y el actor
 * (`@CurrentUser()`) son los únicos datos de entrada. El controller no
 * valida ni persiste nada por sí mismo: delega íntegramente en
 * LabelsService.
 */
@Controller('proyectos/:projectId/tareas/:taskId/etiquetas')
@UseGuards(JwtAuthGuard)
export class TaskLabelsController {
  constructor(private labelsService: LabelsService) {}

  /** E026: asociar etiqueta a tarea. */
  @Put(':labelId')
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(TASK_LABEL_WRITE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async attach(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Param('labelId', ParseIntPipe) labelId: number,
    @CurrentUser() user: { userId: number },
  ): Promise<void> {
    await this.labelsService.attachToTask(projectId, taskId, labelId, user.userId);
  }

  /** E027: retirar etiqueta de tarea. */
  @Delete(':labelId')
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(TASK_LABEL_WRITE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async detach(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Param('labelId', ParseIntPipe) labelId: number,
    @CurrentUser() user: { userId: number },
  ): Promise<void> {
    await this.labelsService.detachFromTask(projectId, taskId, labelId, user.userId);
  }
}
