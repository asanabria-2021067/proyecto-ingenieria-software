import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
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
import { UpdateTimeRecordDto } from './dto/update-time-record.dto';
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

  /**
   * E059: resumen de horas de la tarea. Lectura pura y autorizada por §34: no
   * lleva ProjectWriteGuard porque no escribe, y la proyección que devuelve
   * depende del perfil del lector.
   */
  @Get('resumen')
  getSummary(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.timeRecordsService.getTaskHoursSummary(projectId, taskId, user.userId);
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

  /**
   * E057: corregir un registro propio. Misma familia y misma metadata que el
   * alta — el proyecto en P/E y el Sprint ambiente ACTIVO — porque el tramo
   * puede estar cerrado sin que eso convierta la corrección en una escritura
   * histórica: el servicio resuelve el registro por su propia cadena y exige
   * autoría, tramo no consumido y Sprint de la tarea ACTIVO dentro del lock.
   */
  @Patch(':recordId')
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(TIME_WRITE)
  update(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Param('recordId', ParseIntPipe) recordId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: UpdateTimeRecordDto,
  ) {
    return this.timeRecordsService.update(projectId, taskId, recordId, user.userId, dto);
  }

  /**
   * E058: revocar un registro propio. Es una revocación lógica y por eso
   * responde con el registro conservado, no con 204: el importe, la fecha, la
   * nota y la justificación siguen existiendo como evidencia.
   */
  @Delete(':recordId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(TIME_WRITE)
  revoke(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Param('recordId', ParseIntPipe) recordId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.timeRecordsService.revoke(projectId, taskId, recordId, user.userId);
  }
}
