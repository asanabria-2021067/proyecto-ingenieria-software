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
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminService } from './admin.service';
import { ListAdminUsersQueryDto } from './dto/list-admin-users-query.dto';
import { MetricasQueryDto } from './dto/metricas-query.dto';
import { UpdateAdminUserStatusDto } from './dto/update-admin-user-status.dto';
import { securityRequestContext } from '../security-events/request-context';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrador')
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('estadisticas')
  getEstadisticas(@CurrentUser() user: { userId: number }) {
    return this.adminService.getEstadisticas(user.userId);
  }

  @Get('metricas')
  getMetricas(
    @CurrentUser() user: { userId: number },
    @Query() query: MetricasQueryDto,
  ) {
    return this.adminService.getMetricas(user.userId, query.periodo);
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
}
