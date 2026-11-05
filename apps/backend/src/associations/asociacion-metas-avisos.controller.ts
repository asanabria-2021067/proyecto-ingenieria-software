import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AvisosAsociacionService } from './avisos-asociacion.service';
import { AvisoAsociacionDto } from './dto/aviso-asociacion.dto';
import { DashboardReporteQueryDto } from './dto/dashboard-query.dto';
import { CrearMetaAsociacionDto, ListarMetasQueryDto, MetaPorcentajeDto } from './dto/meta-asociacion.dto';
import { JuntaGuard } from './junta.guard';
import { MetasAsociacionService } from './metas-asociacion.service';

type Actor = { userId: number };

/** Metas (MEJ-162) y avisos (MEJ-161) de la asociación: solo su junta; escribir exige Presidente o Editor (en el servicio). */
@Controller('asociaciones/:idAsociacion')
@UseGuards(JwtAuthGuard, JuntaGuard)
export class AsociacionMetasAvisosController {
  constructor(
    private readonly metas: MetasAsociacionService,
    private readonly avisos: AvisosAsociacionService,
  ) {}

  @Get('metas')
  listarMetas(@Param('idAsociacion', ParseIntPipe) id: number, @Query() query: ListarMetasQueryDto) {
    return this.metas.listar(id, query);
  }

  @Post('metas')
  @HttpCode(HttpStatus.CREATED)
  crearMeta(@Param('idAsociacion', ParseIntPipe) id: number, @Body() dto: CrearMetaAsociacionDto, @CurrentUser() user: Actor) {
    return this.metas.crear(user.userId, id, dto);
  }

  @Patch('metas/:idMeta')
  actualizarMeta(
    @Param('idAsociacion', ParseIntPipe) id: number,
    @Param('idMeta', ParseIntPipe) idMeta: number,
    @Body() dto: MetaPorcentajeDto,
    @CurrentUser() user: Actor,
  ) {
    return this.metas.actualizar(user.userId, id, idMeta, dto.porcentajeObjetivo);
  }

  @Delete('metas/:idMeta')
  eliminarMeta(@Param('idAsociacion', ParseIntPipe) id: number, @Param('idMeta', ParseIntPipe) idMeta: number, @CurrentUser() user: Actor) {
    return this.metas.eliminar(user.userId, id, idMeta);
  }

  @Get('avisos/destinatarios')
  contarDestinatarios(@Param('idAsociacion', ParseIntPipe) id: number, @Query() query: DashboardReporteQueryDto, @CurrentUser() user: Actor) {
    return this.avisos.contar(user.userId, id, query);
  }

  @Post('avisos')
  @HttpCode(HttpStatus.CREATED)
  enviarAviso(@Param('idAsociacion', ParseIntPipe) id: number, @Body() dto: AvisoAsociacionDto, @CurrentUser() user: Actor) {
    return this.avisos.enviar(user.userId, id, dto);
  }
}
