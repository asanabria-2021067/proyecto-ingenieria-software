import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminService } from './admin.service';
import { ListAdminUsersQueryDto } from './dto/list-admin-users-query.dto';
import { MetricasQueryDto } from './dto/metricas-query.dto';
import { AprobarCuentasLoteDto } from './dto/aprobar-cuentas-lote.dto';
import { AdminEntidadesService } from './admin-entidades.service';
import { AdminTablasService } from './admin-tablas.service';
import { AdminEstadoSistemaService } from './admin-estado-sistema.service';
import { AdminTablasQueryDto } from './dto/admin-tablas-query.dto';
import { UpdateAdminUserStatusDto } from './dto/update-admin-user-status.dto';
import { securityRequestContext } from '../security-events/request-context';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrador')
export class AdminController {
  constructor(
    private adminService: AdminService,
    private entidades: AdminEntidadesService,
    private tablas: AdminTablasService,
    private estadoSistema: AdminEstadoSistemaService,
  ) {}

  @Get('estadisticas')
  @Roles('administrador', 'coordinador_academico')
  getEstadisticas(@CurrentUser() user: { userId: number }) {
    return this.adminService.getEstadisticas(user.userId);
  }

  @Get('metricas')
  @Roles('administrador', 'coordinador_academico')
  getMetricas(
    @CurrentUser() user: { userId: number },
    @Query() query: MetricasQueryDto,
  ) {
    return this.adminService.getMetricas(user.userId, query.periodo);
  }

  @Get('metricas/entidades')
  @Roles('administrador', 'coordinador_academico')
  getMetricasEntidades(@CurrentUser() user: { userId: number }) {
    return this.entidades.metricas(user.userId);
  }

  @Get('pendientes')
  @Roles('administrador', 'coordinador_academico')
  getPendientes(@CurrentUser() user: { userId: number }) {
    return this.adminService.getPendientes(user.userId);
  }

  @Get('usuarios')
  getListaUsuarios(
    @CurrentUser() user: { userId: number },
    @Query() query: ListAdminUsersQueryDto,
  ) {
    return this.adminService.getListaUsuarios(user.userId, query);
  }

  @Get('usuarios/:id')
  getUsuarioDetalle(
    @CurrentUser() user: { userId: number },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.adminService.getUsuarioDetalle(user.userId, id);
  }

  @Patch('usuarios/:id/estado')
  updateUsuarioEstado(
    @CurrentUser() user: { userId: number },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAdminUserStatusDto,
    @Req() req: Request,
  ) {
    return this.adminService.updateUsuarioEstado(user.userId, id, dto.estado, securityRequestContext(req));
  }

  @Get('cuentas-pendientes')
  getCuentasPendientes(@CurrentUser() user: { userId: number }) {
    return this.adminService.getCuentasPendientes(user.userId);
  }

  @Post('cuentas-pendientes/aprobar-lote')
  aprobarCuentasLote(
    @CurrentUser() user: { userId: number },
    @Body() dto: AprobarCuentasLoteDto,
    @Req() req: Request,
  ) {
    return this.adminService.aprobarCuentasLote(user.userId, dto.ids, securityRequestContext(req));
  }

  @Patch('cuentas-pendientes/:id/aprobar')
  aprobarCuentaPendiente(
    @CurrentUser() user: { userId: number },
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.adminService.aprobarCuentaPendiente(user.userId, id, securityRequestContext(req));
  }

  @Patch('cuentas-pendientes/:id/rechazar')
  rechazarCuentaPendiente(
    @CurrentUser() user: { userId: number },
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.adminService.rechazarCuentaPendiente(user.userId, id, securityRequestContext(req));
  }

  @Get('password-reset-requests')
  getSolicitudesRecuperacion(@CurrentUser() user: { userId: number }) {
    return this.adminService.getSolicitudesRecuperacionPendientes(user.userId);
  }

  @Post('password-reset-requests/:id/generate-link')
  generarEnlaceRecuperacion(
    @CurrentUser() user: { userId: number },
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.adminService.generarEnlaceRecuperacion(user.userId, id, securityRequestContext(req));
  }

  @Get('estado-sistema')
  getEstadoSistema(@CurrentUser() user: { userId: number }) {
    return this.estadoSistema.obtener(user.userId);
  }

  @Get('tablas')
  listarTablas(@CurrentUser() user: { userId: number }) {
    return this.tablas.listarEntidades(user.userId);
  }

  @Get('tablas/:entidad')
  consultarTabla(
    @CurrentUser() user: { userId: number },
    @Param('entidad') entidad: string,
    @Query() query: AdminTablasQueryDto,
  ) {
    return this.tablas.consultar(user.userId, entidad, query);
  }

  @Get('tablas/:entidad/exportar')
  async exportarTabla(
    @CurrentUser() user: { userId: number },
    @Param('entidad') entidad: string,
    @Query() query: AdminTablasQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const csv = await this.tablas.exportar(user.userId, entidad, query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `attachment; filename="tabla-${entidad}.csv"`);
    return csv;
  }

  @Get('tablas/:entidad/:id')
  detalleTabla(
    @CurrentUser() user: { userId: number },
    @Param('entidad') entidad: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.tablas.detalle(user.userId, entidad, id);
  }
}
