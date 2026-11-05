import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { MaintenanceService } from './maintenance.service';
import { UpdateMaintenanceDto } from './dto/update-maintenance.dto';

/** Estado mínimo y público para que el frontend pinte la pantalla de mantenimiento. */
@Controller('mantenimiento')
export class MantenimientoController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @Get()
  async estado() {
    const { bloqueando, mensaje, regresoEstimado, inicioProgramado } = await this.maintenance.estado();
    return { bloqueando, mensaje, regresoEstimado, inicioProgramado };
  }
}

@Controller('admin/mantenimiento')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrador')
export class MantenimientoAdminController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @Get()
  estado() {
    return this.maintenance.estado();
  }

  @Put()
  actualizar(@CurrentUser() user: { userId: number }, @Body() dto: UpdateMaintenanceDto) {
    return this.maintenance.actualizar(user.userId, dto);
  }
}
