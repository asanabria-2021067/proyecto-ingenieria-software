import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { InsigniasService } from './insignias.service';

@Controller('insignias')
@UseGuards(JwtAuthGuard)
export class InsigniasController {
  constructor(private readonly insignias: InsigniasService) {}

  /** Insignias del usuario autenticado (obtenidas y bloqueadas con su progreso). */
  @Get('me')
  listarMias(@CurrentUser() user: { userId: number }) {
    return this.insignias.listarMias(user.userId);
  }
}
