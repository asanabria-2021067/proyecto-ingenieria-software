import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ProjectWriteGuard } from '../common/guards/project-write.guard';
import { ProjectWrite, type ProjectWriteMetadata } from '../common/guards/project-write.metadata';
import { SprintsService } from './sprints.service';

/**
 * C045 (06 v2 §32/§41 E060–E062): ciclo de vida del Sprint. El proyecto se
 * resuelve desde `params.projectId` y las tres operaciones exigen P/E; el
 * ambiente distingue cada una: iniciar solo sin Sprint operable, finalizar
 * con un Sprint ACTIVO y cerrar con uno EN_FINALIZACION.
 */
const SPRINT_START: ProjectWriteMetadata = {
  source: { kind: 'param', name: 'projectId' },
  states: ['P', 'E'],
  sprint: 'NONE_OPERABLE',
  family: 'SPRINT_START',
};
const SPRINT_FINALIZE: ProjectWriteMetadata = {
  ...SPRINT_START,
  sprint: 'ACTIVO',
  family: 'SPRINT_FINALIZE',
};
const SPRINT_CLOSE: ProjectWriteMetadata = {
  ...SPRINT_START,
  sprint: 'EN_FINALIZACION',
  family: 'SPRINT_CLOSE',
};

@Controller('proyectos/:projectId/sprints')
@UseGuards(JwtAuthGuard)
export class SprintsController {
  constructor(private readonly sprintsService: SprintsService) {}

  /** E060: iniciar Sprint (líder, sin Sprint operable). */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(SPRINT_START)
  start(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.sprintsService.startSprint(projectId, user.userId);
  }

  /** E061: finalizar el Sprint ACTIVO. */
  @Post(':sprintId/finalizar')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(SPRINT_FINALIZE)
  finalize(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('sprintId', ParseIntPipe) sprintId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.sprintsService.finalizeSprint(projectId, sprintId, user.userId);
  }

  /** E062: cerrar el Sprint EN_FINALIZACION. */
  @Post(':sprintId/cerrar')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(SPRINT_CLOSE)
  close(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('sprintId', ParseIntPipe) sprintId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.sprintsService.closeSprint(projectId, sprintId, user.userId);
  }

  /** E066: resumen de cierre (líder actual mientras el Sprint no esté cerrado). */
  @Get(':sprintId/resumen-cierre')
  @HttpCode(HttpStatus.OK)
  getClosingSummary(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('sprintId', ParseIntPipe) sprintId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.sprintsService.getSprintClosingSummary(projectId, sprintId, user.userId);
  }

  /**
   * T-173: registrada ANTES de `detail(':sprintId')` a propósito — Nest/Express
   * matchea rutas en orden de registro, y `analytics` (segmento literal)
   * colisionaría con `:sprintId` (segmento parámetro) si `detail` fuera
   * primero: una request a `GET .../sprints/analytics` caería en `detail`
   * con `sprintId='analytics'`, que `ParseIntPipe` rechazaría con 400 en vez
   * de resolver la analítica comparativa.
   */
  /** E068: analítica comparativa; el ámbito por actor se aplica en la consulta. */
  @Get('analytics')
  @HttpCode(HttpStatus.OK)
  getComparativeAnalytics(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.sprintsService.getSprintsAnalytics(projectId, user.userId);
  }

  /** E064: lista de Sprints con el alcance por actor (§34). */
  @Get()
  @HttpCode(HttpStatus.OK)
  list(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.sprintsService.listSprints(projectId, user.userId);
  }

  /** E065: detalle de un Sprint; ACTIVO/EN_FINALIZACION solo para el líder. */
  @Get(':sprintId')
  @HttpCode(HttpStatus.OK)
  detail(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('sprintId', ParseIntPipe) sprintId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.sprintsService.getSprintDetail(projectId, sprintId, user.userId);
  }

  /** T-172: `:sprintId/analytics` nunca colisiona con `:sprintId` (arriba) — distinto número de segmentos, el orden entre ambas es irrelevante. */
  /** E067: analítica de un Sprint con el mismo alcance por actor. */
  @Get(':sprintId/analytics')
  @HttpCode(HttpStatus.OK)
  getAnalytics(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('sprintId', ParseIntPipe) sprintId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.sprintsService.getSprintAnalytics(projectId, sprintId, user.userId);
  }
}
