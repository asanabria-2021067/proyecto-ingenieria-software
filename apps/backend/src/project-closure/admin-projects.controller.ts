import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminProjectsQueryDto } from './dto/admin-projects-query.dto';
import { HistoricalProjectReadService } from './historical-project-read.service';

/**
 * C121 (06 v2 §38/§41 E116–E117): bandeja y detalle administrativos.
 *
 * Da al administrador LECTURA, nunca autoridad operativa sobre el equipo: ver
 * un proyecto no convierte a nadie en su líder.
 *
 * GPI01-C09 (H-07) / T-286: el rol se exige en un guard (`RolesGuard`), antes
 * de validar `grupo` o `projectId`. Sin sesión 401, sin el rol 403, y solo un
 * administrador llega a recibir un 400 de validación. El servicio conserva su
 * propia comprobación.
 */
@Controller('admin/proyectos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrador')
export class AdminProjectsController {
  constructor(protected readonly historical: HistoricalProjectReadService) {}

  /** E116: bandeja por grupo, paginada. */
  @Get()
  list(@CurrentUser() user: { userId: number }, @Query() query: AdminProjectsQueryDto) {
    return this.historical.adminList(user.userId, query);
  }

  /** E117: detalle; en vivo solo Sprints cerrados, en cerrado el histórico. */
  @Get(':projectId')
  detail(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.historical.adminDetail(user.userId, projectId);
  }
}
