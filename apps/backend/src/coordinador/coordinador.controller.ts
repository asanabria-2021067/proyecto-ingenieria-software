import { Body, Controller, Get, Param, ParseIntPipe, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { GuardarAlcanceDto } from './dto/alcance-coordinador.dto';
import { CoordinadorService } from './coordinador.service';

@Controller('admin/coordinadores')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrador')
export class AdminCoordinadoresController {
  constructor(private readonly service: CoordinadorService) {}

  @Get(':idUsuario/alcance')
  leer(@CurrentUser() user: { userId: number }, @Param('idUsuario', ParseIntPipe) idUsuario: number) {
    return this.service.leerAlcance(user.userId, idUsuario);
  }

  @Put(':idUsuario/alcance')
  guardar(
    @CurrentUser() user: { userId: number },
    @Param('idUsuario', ParseIntPipe) idUsuario: number,
    @Body() dto: GuardarAlcanceDto,
  ) {
    return this.service.guardarAlcance(user.userId, idUsuario, dto);
  }
}

@Controller('coordinador')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrador', 'coordinador_academico')
export class CoordinadorController {
  constructor(private readonly service: CoordinadorService) {}

  @Get('mi-alcance')
  miAlcance(@CurrentUser() user: { userId: number }) {
    return this.service.miAlcance(user.userId);
  }

  @Get('pendientes')
  pendientes(@CurrentUser() user: { userId: number }) {
    return this.service.pendientes(user.userId);
  }
}
