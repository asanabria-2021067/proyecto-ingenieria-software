import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminSprintsCalendarService } from './admin-sprints-calendar.service';
import { AdminSprintCalendarQueryDto } from './dto/admin-sprint-calendar-query.dto';

/**
 * Superficie administrativa del dominio Sprint. Mismo criterio que
 * `AdminProjectsController`: da al administrador LECTURA de supervisión,
 * nunca autoridad operativa sobre el Sprint de un equipo.
 *
 * El JWT solo identifica al actor; que sea administrador lo valida el
 * servicio contra la base en cada petición.
 */
@Controller('admin/sprints')
@UseGuards(JwtAuthGuard)
export class AdminSprintsController {
  constructor(private readonly calendar: AdminSprintsCalendarService) {}

  /** Calendario de Sprints operables de proyectos activos; sin parámetros. */
  @Get('calendario')
  getCalendario(
    @CurrentUser() user: { userId: number },
    // Sin uso a propósito: declararlo es lo que hace rechazar con 400
    // cualquier parámetro de query.
    @Query() _query: AdminSprintCalendarQueryDto,
  ) {
    return this.calendar.getCalendar(user.userId);
  }
}
