import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminProjectsQueryDto } from './dto/admin-projects-query.dto';
import { HistoricalProjectReadService } from './historical-project-read.service';

/**
 * C121 (06 v2 §38/§41 E116–E117): bandeja y detalle administrativos.
 *
 * Da al administrador LECTURA, nunca autoridad operativa sobre el equipo: ver
 * un proyecto no convierte a nadie en su líder.
 */
@Controller('admin/proyectos')
@UseGuards(JwtAuthGuard)
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
