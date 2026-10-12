import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminSprintsCalendarService } from './admin-sprints-calendar.service';
import { AdminSprintCalendarQueryDto } from './dto/admin-sprint-calendar-query.dto';

/**
 * Superficie administrativa del dominio Sprint. Mismo criterio que
 * `AdminProjectsController`: da al administrador LECTURA de supervisión,
 * nunca autoridad operativa sobre el Sprint de un equipo.
 *
 * El JWT solo identifica al actor. Que sea administrador se exige en un guard
 * (`RolesGuard`, T-286), contra la base y antes de validar la consulta: sin
 * sesión 401, sin el rol 403, y solo un administrador llega a recibir un 400.
 * El servicio conserva su propia comprobación.
 */
@Controller('admin/sprints')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrador')
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
