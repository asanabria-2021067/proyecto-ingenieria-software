import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AsistenteReunionesQueryDto, ReplaceDisponibilidadDto, ReplaceEnlacesDto, UpdatePortafolioDto } from './dto/perfil-portafolio.dto';
import { AsistenteReunionesService } from './asistente-reuniones.service';
import { PersonasParecidasService } from './personas-parecidas.service';
import { DisponibilidadSemanalService } from './disponibilidad-semanal.service';
import { EnlacesPerfilService } from './enlaces-perfil.service';
import { HabilidadConfirmacionesService } from './habilidad-confirmaciones.service';
import { PortafolioService } from './portafolio.service';
import { SemestreResumenService } from './semestre-resumen.service';

type Actor = { userId: number };

/** Permisos en los servicios: el actor sale siempre del JWT; las rutas `me` solo tocan lo propio. Las rutas `me` van antes que `:id`. */
@Controller('perfil')
@UseGuards(JwtAuthGuard)
export class PerfilPortafolioController {
  constructor(
    private readonly portafolio: PortafolioService,
    private readonly confirmaciones: HabilidadConfirmacionesService,
    private readonly disponibilidad: DisponibilidadSemanalService,
    private readonly enlaces: EnlacesPerfilService,
    private readonly semestre: SemestreResumenService,
    private readonly asistente: AsistenteReunionesService,
    private readonly parecidas: PersonasParecidasService,
  ) {}

  @Get('me/portafolio')
  estadoPortafolio(@CurrentUser() user: Actor) {
    return this.portafolio.estado(user.userId);
  }

  @Put('me/portafolio')
  actualizarPortafolio(@CurrentUser() user: Actor, @Body() dto: UpdatePortafolioDto) {
    return this.portafolio.actualizar(user.userId, dto);
  }

  @Post('me/portafolio/regenerar')
  @HttpCode(200)
  regenerarPortafolio(@CurrentUser() user: Actor) {
    return this.portafolio.regenerar(user.userId);
  }

  @Put('me/disponibilidad')
  reemplazarDisponibilidad(@CurrentUser() user: Actor, @Body() dto: ReplaceDisponibilidadDto) {
    return this.disponibilidad.reemplazar(user.userId, dto.bloques);
  }

  @Put('me/enlaces')
  reemplazarEnlaces(@CurrentUser() user: Actor, @Body() dto: ReplaceEnlacesDto) {
    return this.enlaces.reemplazar(user.userId, dto.urls);
  }

  @Get('asistente-reuniones')
  asistenteReuniones(@CurrentUser() user: Actor, @Query() query: AsistenteReunionesQueryDto) {
    return this.asistente.consultar(user.userId, query.invitados, query.desde, query.dias ?? 7, query.horas ?? 1);
  }

  @Get('me/semestre')
  resumenSemestre(@CurrentUser() user: Actor) {
    return this.semestre.resumen(user.userId);
  }

  @Get(':id/habilidades')
  habilidades(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: Actor) {
    return this.confirmaciones.listar(user.userId, id);
  }

  @Put(':id/habilidades/:idHabilidad/confirmacion')
  confirmar(
    @Param('id', ParseIntPipe) id: number,
    @Param('idHabilidad', ParseIntPipe) idHabilidad: number,
    @CurrentUser() user: Actor,
  ) {
    return this.confirmaciones.confirmar(user.userId, id, idHabilidad);
  }

  @Delete(':id/habilidades/:idHabilidad/confirmacion')
  retirarConfirmacion(
    @Param('id', ParseIntPipe) id: number,
    @Param('idHabilidad', ParseIntPipe) idHabilidad: number,
    @CurrentUser() user: Actor,
  ) {
    return this.confirmaciones.retirar(user.userId, id, idHabilidad);
  }

  @Get(':id/personas-parecidas')
  personasParecidas(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: Actor) {
    return this.parecidas.listar(user.userId, id);
  }

  @Get(':id/disponibilidad')
  verDisponibilidad(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: Actor) {
    return this.disponibilidad.obtener(user.userId, id);
  }

  @Get(':id/enlaces')
  verEnlaces(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: Actor) {
    return this.enlaces.listar(user.userId, id);
  }
}
