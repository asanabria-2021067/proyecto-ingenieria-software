import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { HorasSemestreService } from './horas-semestre.service';
import { UpdateRegistroHorasDto } from './dto/update-registro-horas.dto';

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

  @Get('historial')
  getHistorial(@CurrentUser() user: { userId: number }) {
    return this.service.getHistorial(user.userId);
  }
}
