import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ProjectWriteGuard } from '../common/guards/project-write.guard';
import { ProjectWrite, type ProjectWriteMetadata } from '../common/guards/project-write.metadata';
import { AttendanceService } from './attendance.service';
import { CreateActividadDto } from './dto/create-actividad.dto';
import { MarkAttendanceDto } from './dto/mark-attendance.dto';

/** HU-177: crear actividad y marcar asistencia son exclusivos del líder (Proyecto.creadoPor). */
const ACTIVITY_WRITE: ProjectWriteMetadata = {
  source: { kind: 'param', name: 'projectId' },
  states: ['P', 'E'],
  sprint: 'ANY',
  family: 'ACTIVIDAD_ASISTENCIA',
};

@Controller('proyectos/:projectId/actividades')
@UseGuards(JwtAuthGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get()
  findAll(@Param('projectId', ParseIntPipe) projectId: number, @CurrentUser() user: { userId: number }) {
    return this.attendanceService.listarActividades(projectId, user.userId);
  }

  @Get(':actividadId')
  findOne(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('actividadId', ParseIntPipe) actividadId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.attendanceService.obtenerActividad(projectId, user.userId, actividadId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(ACTIVITY_WRITE)
  create(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: CreateActividadDto,
  ) {
    return this.attendanceService.crearActividad(projectId, user.userId, dto);
  }

  @Patch(':actividadId/asistencia/:usuarioId')
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(ACTIVITY_WRITE)
  markAttendance(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('actividadId', ParseIntPipe) actividadId: number,
    @Param('usuarioId', ParseIntPipe) usuarioId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: MarkAttendanceDto,
  ) {
    return this.attendanceService.marcarAsistencia(projectId, user.userId, actividadId, usuarioId, dto);
  }
}
