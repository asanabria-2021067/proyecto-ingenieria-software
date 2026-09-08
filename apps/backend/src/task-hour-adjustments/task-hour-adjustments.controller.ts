import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ProjectWriteGuard } from '../common/guards/project-write.guard';
import { ProjectWrite, type ProjectWriteMetadata } from '../common/guards/project-write.metadata';
import { UpsertHourAdjustmentDto } from './dto/upsert-hour-adjustment.dto';
import { TaskHourAdjustmentsService } from './task-hour-adjustments.service';

/**
 * C071 (06 v2 §32/§41 E070–E072): el ajuste es del LÍDER, con el proyecto en
 * P/E y tanto el Sprint ambiente como el Sprint de la entidad en
 * EN_FINALIZACION. Esa ventana es el punto: se corrige mientras se cierra, no
 * durante la ejecución ni después del cierre.
 */
const ADJUSTMENT_WRITE: ProjectWriteMetadata = {
  source: { kind: 'param', name: 'projectId' },
  states: ['P', 'E'],
  sprint: 'EN_FINALIZACION',
  family: 'AJUSTE_HORA',
};

@Controller('proyectos/:projectId/sprints/:sprintId/asignaciones/:assignmentId/ajuste-horas')
@UseGuards(JwtAuthGuard)
export class TaskHourAdjustmentsController {
  constructor(private readonly adjustments: TaskHourAdjustmentsService) {}

  /** E072: cadena completa de ajustes del tramo, anulados incluidos. */
  @Get()
  history(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('sprintId', ParseIntPipe) sprintId: number,
    @Param('assignmentId', ParseIntPipe) assignmentId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.adjustments.history(projectId, sprintId, assignmentId, user.userId);
  }

  /** E070: registrar o corregir el ajuste vigente del tramo. */
  @Post()
  @HttpCode(HttpStatus.OK)
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(ADJUSTMENT_WRITE)
  upsert(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('sprintId', ParseIntPipe) sprintId: number,
    @Param('assignmentId', ParseIntPipe) assignmentId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: UpsertHourAdjustmentDto,
  ) {
    return this.adjustments.upsert(projectId, sprintId, assignmentId, user.userId, dto);
  }

  /** E071: revertir el ajuste vigente; sin vigente responde 204 igualmente. */
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(ADJUSTMENT_WRITE)
  revert(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('sprintId', ParseIntPipe) sprintId: number,
    @Param('assignmentId', ParseIntPipe) assignmentId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.adjustments.revert(projectId, sprintId, assignmentId, user.userId);
  }
}
