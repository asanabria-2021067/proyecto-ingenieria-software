import { Controller, Get, Param, ParseIntPipe, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { GetEventsRangeQueryDto } from './dto/get-events-range-query.dto';
import { EventsService } from './events.service';
import { construirIcs, enviarIcs } from './ics.util';

/** MEJ-34: calendario de la organización; el servicio exige ser miembro activo. */
@Controller('organizaciones/:id/calendario')
@UseGuards(JwtAuthGuard)
export class OrganizationEventsController {
  constructor(private eventsService: EventsService) {}

  @Get()
  findInRange(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { userId: number },
    @Query() query: GetEventsRangeQueryDto,
  ) {
    return this.eventsService.findForOrganizationInRange(id, user.userId, query.desde, query.hasta);
  }

  @Get('ics')
  async exportIcs(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { userId: number },
    @Query() query: GetEventsRangeQueryDto,
    @Res() res: Response,
  ) {
    const eventos = await this.eventsService.findForOrganizationInRange(id, user.userId, query.desde, query.hasta);
    enviarIcs(res, construirIcs(eventos), `organizacion-${id}.ics`);
  }
}
