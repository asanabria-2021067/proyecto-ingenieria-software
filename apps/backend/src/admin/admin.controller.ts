import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminService } from './admin.service';
import { ListAdminUsersQueryDto } from './dto/list-admin-users-query.dto';
import { UpdateAdminUserStatusDto } from './dto/update-admin-user-status.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('estadisticas')
  getEstadisticas(@CurrentUser() user: { userId: number }) {
    return this.adminService.getEstadisticas(user.userId);
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
  ) {
    return this.adminService.updateUsuarioEstado(user.userId, id, dto.estado);
  }

  @Get('password-reset-requests')
  getSolicitudesRecuperacion(@CurrentUser() user: { userId: number }) {
    return this.adminService.getSolicitudesRecuperacionPendientes(user.userId);
  }

  @Post('password-reset-requests/:id/generate-link')
  generarEnlaceRecuperacion(
    @CurrentUser() user: { userId: number },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.adminService.generarEnlaceRecuperacion(user.userId, id);
  }
}
