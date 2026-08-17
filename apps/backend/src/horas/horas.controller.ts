import { Controller, Get, Post, Param, Body, ParseIntPipe, UseGuards } from '@nestjs/common';
import { HorasService } from './horas.service';
import { CerrarParticipacionDto } from './dto/cerrar-participacion.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('proyectos/:projectId/participaciones/:participacionId/horas')
@UseGuards(JwtAuthGuard)
export class HorasController {
  constructor(private readonly horasService: HorasService) {}

  @Get('desglose')
  obtenerDesglose(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('participacionId', ParseIntPipe) participacionId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.horasService.obtenerDesglose(projectId, participacionId, user.userId);
  }

  @Post('cerrar')
  cerrarParticipacion(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('participacionId', ParseIntPipe) participacionId: number,
    @Body() dto: CerrarParticipacionDto,
    @CurrentUser() user: { userId: number },
  ) {
    return this.horasService.cerrarParticipacion(projectId, participacionId, dto, user.userId);
  }
}
