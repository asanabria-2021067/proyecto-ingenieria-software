import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CrearReportePerfilDto, ListarReportesPerfilQueryDto, ResolverReportePerfilDto } from './dto/restricciones-reportes.dto';
import { ReportesPerfilService } from './reportes-perfil.service';
import { RestriccionesService } from './restricciones.service';

type Actor = { userId: number };

export const tipoDe = (tipo: string) => {
  if (tipo === 'silencio') return 'SILENCIO';
  if (tipo === 'bloqueo') return 'BLOQUEO';
  throw new BadRequestException('Tipo de restricción no válido');
};

/** Bloqueos y silencios propios (MEJ-153) y reportes de perfil/mensaje (MEJ-154). Permisos en los servicios; el actor sale del JWT. */
@Controller()
@UseGuards(JwtAuthGuard)
export class RestriccionesController {
  constructor(
    private readonly restricciones: RestriccionesService,
    private readonly reportes: ReportesPerfilService,
  ) {}

  @Get('restricciones')
  listar(@CurrentUser() user: Actor) {
    return this.restricciones.listar(user.userId);
  }

  @Put('restricciones/:tipo/:idObjetivo')
  aplicar(@Param('tipo') tipo: string, @Param('idObjetivo', ParseIntPipe) idObjetivo: number, @CurrentUser() user: Actor) {
    return this.restricciones.aplicar(user.userId, idObjetivo, tipoDe(tipo));
  }

  @Delete('restricciones/:tipo/:idObjetivo')
  quitar(@Param('tipo') tipo: string, @Param('idObjetivo', ParseIntPipe) idObjetivo: number, @CurrentUser() user: Actor) {
    return this.restricciones.quitar(user.userId, idObjetivo, tipoDe(tipo));
  }

  @Throttle({ short: { limit: 5, ttl: 60000 } })
  @Post('reportes-perfil')
  @HttpCode(201)
  reportar(@CurrentUser() user: Actor, @Body() dto: CrearReportePerfilDto) {
    return this.reportes.crear(user.userId, dto);
  }

  @Get('admin/reportes-perfil')
  @UseGuards(RolesGuard)
  @Roles('administrador')
  listarReportes(@CurrentUser() user: Actor, @Query() query: ListarReportesPerfilQueryDto) {
    return this.reportes.listar(user.userId, query.estado);
  }

  @Patch('admin/reportes-perfil/:id')
  @UseGuards(RolesGuard)
  @Roles('administrador')
  resolverReporte(@CurrentUser() user: Actor, @Param('id', ParseIntPipe) id: number, @Body() dto: ResolverReportePerfilDto) {
    return this.reportes.resolver(user.userId, id, dto.accion, dto.nota);
  }
}
