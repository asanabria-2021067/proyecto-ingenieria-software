import { Body, Controller, Get, Param, ParseIntPipe, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BienvenidaService } from './bienvenida.service';
import { UpdateBienvenidaDto } from './dto/update-bienvenida.dto';

/** MEJ-102: configuracion del mensaje de bienvenida; el permiso (solo el lider) se verifica en el servicio. */
@Controller('proyectos/:id/mensaje-bienvenida')
@UseGuards(JwtAuthGuard)
export class BienvenidaController {
  constructor(private readonly bienvenida: BienvenidaService) {}

  @Get()
  obtener(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: { userId: number }) {
    return this.bienvenida.obtener(id, user.userId);
  }

  @Put()
  guardar(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateBienvenidaDto, @CurrentUser() user: { userId: number }) {
    return this.bienvenida.guardar(id, user.userId, dto.mensaje);
  }
}
