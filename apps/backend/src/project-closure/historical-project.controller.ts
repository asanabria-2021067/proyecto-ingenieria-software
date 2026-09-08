import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { HistoricalProjectReadService } from './historical-project-read.service';

/**
 * C121 (06 v2 §38/§41 E118): lectura histórica de un proyecto.
 *
 * Es una superficie AUTENTICADA y aparte del `GET` público de proyecto, que
 * sigue limitado a publicado y en progreso: cerrar un proyecto no lo hace
 * público, solo lo hace legible para quienes participaron en él.
 */
@Controller('proyectos/:projectId')
@UseGuards(JwtAuthGuard)
export class HistoricalProjectController {
  constructor(protected readonly historical: HistoricalProjectReadService) {}

  /** E118: proyección histórica completa, según lo que el lector puede ver. */
  @Get('historico')
  historicalProject(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.historical.historicalProject(projectId, user.userId);
  }

  /**
   * E119 (§15): contribuciones de tareas eliminadas de un Sprint.
   *
   * Es una lectura HISTÓRICA: devuelve el trabajo que existió, marcado como
   * tal, y no reabre nada. El tablero operativo sigue filtrando las tareas
   * eliminadas exactamente como antes.
   */
  @Get('sprints/:sprintId/contribuciones-eliminadas')
  deletedContributions(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('sprintId', ParseIntPipe) sprintId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.historical.deletedContributions(projectId, user.userId, sprintId);
  }
}
