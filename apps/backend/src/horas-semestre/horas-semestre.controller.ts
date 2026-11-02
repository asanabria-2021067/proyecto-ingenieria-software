import { Body, Controller, Get, Put, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { HorasSemestreService } from './horas-semestre.service';
import { UpdateRegistroHorasDto } from './dto/update-registro-horas.dto';
import { ConstanciaQueryDto } from './dto/constancia-query.dto';
import { renderConstanciaHorasPdf } from '../exports/constancia-horas.builder';

@Controller('horas-semestre')
@UseGuards(JwtAuthGuard)
export class HorasSemestreController {
  constructor(private readonly service: HorasSemestreService) {}

  @Get('actual')
  getActual(@CurrentUser() user: { userId: number }) {
    return this.service.getActual(user.userId);
  }

  @Put('actual')
  actualizarActual(@CurrentUser() user: { userId: number }, @Body() dto: UpdateRegistroHorasDto) {
    return this.service.actualizarActual(user.userId, dto);
  }

  @Get('progreso')
  getProgreso(@CurrentUser() user: { userId: number }) {
    return this.service.getProgreso(user.userId);
  }

  /** MEJ-11: constancia PDF de las horas acreditadas del propio estudiante en un semestre. */
  @Get('constancia')
  async constancia(@CurrentUser() user: { userId: number }, @Query() query: ConstanciaQueryDto, @Res() res: Response) {
    const datos = await this.service.datosConstancia(user.userId, query);
    const bytes = renderConstanciaHorasPdf(datos);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `attachment; filename="constancia-horas-${datos.semestre.anio}-${datos.semestre.periodo}.pdf"`);
    res.setHeader('Content-Length', String(bytes.length));
    res.status(200).end(bytes);
  }

  @Get('historial')
  getHistorial(@CurrentUser() user: { userId: number }) {
    return this.service.getHistorial(user.userId);
  }
}
