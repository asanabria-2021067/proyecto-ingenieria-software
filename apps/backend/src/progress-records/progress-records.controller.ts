import { Body, Controller, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ProjectWriteGuard } from '../common/guards/project-write.guard';
import { ProjectWrite, type ProjectWriteMetadata } from '../common/guards/project-write.metadata';

/**
 * C042 (06 v2 §32/§41 E053–E054): avances del propietario del tramo en P/E
 * con Sprint ambiente ACTIVO; la entidad (Sprint de la tarea) también debe
 * estar ACTIVO y la verifica el servicio dentro del lock.
 */
const PROGRESS_WRITE: ProjectWriteMetadata = {
  source: { kind: 'param', name: 'projectId' },
  states: ['P', 'E'],
  sprint: 'ACTIVO',
  family: 'AVANCE',
};
import { CreateProgressRecordDto } from './dto/create-progress-record.dto';
import { UpdateProgressRecordDto } from './dto/update-progress-record.dto';
import { ProgressRecordsService } from './progress-records.service';

@Controller('proyectos/:projectId/tareas/:taskId/asignaciones/:assignmentId/avance')
@UseGuards(JwtAuthGuard)
export class ProgressRecordsController {
  constructor(private readonly progressRecordsService: ProgressRecordsService) {}

  /** E053: registrar avance del tramo propio. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(PROGRESS_WRITE)
  create(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Param('assignmentId', ParseIntPipe) assignmentId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: CreateProgressRecordDto,
  ) {
    return this.progressRecordsService.create(projectId, taskId, assignmentId, user.userId, dto);
  }

  /** E054: editar un avance propio. */
  @Patch(':progressRecordId')
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(PROGRESS_WRITE)
  update(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Param('assignmentId', ParseIntPipe) assignmentId: number,
    @Param('progressRecordId', ParseIntPipe) progressRecordId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: UpdateProgressRecordDto,
  ) {
    return this.progressRecordsService.update(
      projectId,
      taskId,
      assignmentId,
      progressRecordId,
      user.userId,
      dto,
    );
  }
}
