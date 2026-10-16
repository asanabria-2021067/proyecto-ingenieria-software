import { Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AnunciosService } from './anuncios.service';

/** Lectura y cierre del usuario autenticado; el actor sale siempre del JWT. */
@Controller('anuncios')
@UseGuards(JwtAuthGuard)
export class AnunciosController {
  constructor(private anunciosService: AnunciosService) {}

  @Get('vigentes')
  findVigentes(@CurrentUser() user: { userId: number }) {
    return this.anunciosService.findVigentes(user.userId);
  }

  @Post(':id/cierre')
  @HttpCode(HttpStatus.OK)
  cerrar(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: { userId: number }) {
    return this.anunciosService.cerrar(user.userId, id);
  }
}
