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
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { GetEventsRangeQueryDto } from '../events/dto/get-events-range-query.dto';
import { CalendarSharesService } from './calendar-shares.service';
import { ShareCalendarDto } from './dto/share-calendar.dto';

/**
 * HU-184: compartir el calendario propio y leer los que otros me
 * compartieron. El actor sale siempre de @CurrentUser(): nadie puede
 * compartir el calendario de otro ni leer uno que no le compartieron.
 */
@Controller('usuarios/me/calendario')
@UseGuards(JwtAuthGuard)
export class CalendarSharesController {
  constructor(private readonly calendarShares: CalendarSharesService) {}

  @Get('compartidos')
  listar(@CurrentUser() user: { userId: number }) {
    return this.calendarShares.listar(user.userId);
  }

  @Post('compartidos')
  @HttpCode(HttpStatus.CREATED)
  compartir(@CurrentUser() user: { userId: number }, @Body() dto: ShareCalendarDto) {
    return this.calendarShares.compartir(user.userId, dto.idUsuario);
  }

  @Delete('compartidos/:idUsuario')
  dejarDeCompartir(
    @CurrentUser() user: { userId: number },
    @Param('idUsuario', ParseIntPipe) idUsuario: number,
  ) {
    return this.calendarShares.dejarDeCompartir(user.userId, idUsuario);
  }

  @Get('compartidos-conmigo/:idPropietario/agenda')
  agenda(
    @CurrentUser() user: { userId: number },
    @Param('idPropietario', ParseIntPipe) idPropietario: number,
    @Query() query: GetEventsRangeQueryDto,
  ) {
    return this.calendarShares.agendaCompartida(user.userId, idPropietario, query.desde, query.hasta);
  }
}
