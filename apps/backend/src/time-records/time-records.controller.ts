import {
  Body,
  Controller,
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

/**
 * C049 (06 v2 §32/§41 E055–E056): el alta de horas es del propietario del
 * tramo, en P/E con Sprint ambiente ACTIVO; la entidad (Sprint de la tarea)
 * también debe estar ACTIVO y la verifica el servicio dentro del lock.
 */
const TIME_WRITE: ProjectWriteMetadata = {
  source: { kind: 'param', name: 'projectId' },
  states: ['P', 'E'],
  sprint: 'ACTIVO',
  family: 'REGISTRO_TIEMPO',
};
import { CreateTimeRecordDto } from './dto/create-time-record.dto';
import { TimeRecordsService } from './time-records.service';

@Controller('proyectos/:projectId/tareas/:taskId/horas')
@UseGuards(JwtAuthGuard)
export class TimeRecordsController {
  constructor(private readonly timeRecordsService: TimeRecordsService) {}

  /** E055: horas de la tarea; alcance §34 en el servicio. */
  @Get()
  findAll(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.timeRecordsService.findAllForTask(projectId, taskId, user.userId);
  }

  /** E056: registrar horas sobre el tramo propio. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(TIME_WRITE)
  create(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: CreateTimeRecordDto,
  ) {
    return this.timeRecordsService.create(projectId, taskId, user.userId, dto);
  }
}
