import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ClosureCleanupService } from './closure-cleanup.service';
import { SweepDto } from './dto/closure.dto';

/**
 * C127 (06 v2 §41 E120): superficie administrativa del almacenamiento de
 * cierre. El barrido es una operación de mantenimiento, no del ciclo de vida
 * del proyecto, y por eso vive en su propio controller.
 */
@Controller('admin/storage/cierre')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrador')
export class ClosureStorageAdminController {
  constructor(protected readonly cleanup: ClosureCleanupService) {}

  @Post('barrido')
  sweep(@CurrentUser() user: { userId: number }, @Body() dto: SweepDto) {
    return this.cleanup.sweep(user.userId, dto);
  }
}
