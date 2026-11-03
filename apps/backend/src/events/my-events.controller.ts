import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { construirIcs, enviarIcs } from './ics.util';
import { EventsService } from './events.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { GetEventsRangeQueryDto } from './dto/get-events-range-query.dto';

/**
 * HU-169 (T-263/T-264): eventos de todos los proyectos del usuario (líder o
 * participante ACTIVO) dentro de un rango de fechas — misma vista global que
 * GET /usuarios/me/tareas, que la vista de calendario consume junto a esta.
 */
@Controller('usuarios/me/eventos')
@UseGuards(JwtAuthGuard)
export class MyEventsController {
  constructor(private eventsService: EventsService) {}

  /** MEJ-33: los mismos eventos del rango, como archivo .ics para Google/Outlook/Apple Calendar. */
  @Get('ics')
  async exportIcs(
    @CurrentUser() user: { userId: number },
    @Query() query: GetEventsRangeQueryDto,
    @Res() res: Response,
  ) {
    const eventos = await this.eventsService.findForUserInRange(user.userId, query.desde, query.hasta);
    enviarIcs(res, construirIcs(eventos, 'Mi calendario'), 'uvgenius-calendario.ics');
  }

  @Get()
  findInRange(
    @CurrentUser() user: { userId: number },
    @Query() query: GetEventsRangeQueryDto,
  ) {
    return this.eventsService.findForUserInRange(user.userId, query.desde, query.hasta);
  }
}
