import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ProjectWriteGuard } from '../common/guards/project-write.guard';
import { ProjectWrite, type ProjectWriteMetadata } from '../common/guards/project-write.metadata';
import type { ClosurePhase } from './project-close-readiness.service';
import { GenerateReportDto } from './dto/closure.dto';
import { ProjectClosureReportService } from './project-closure-report.service';
import { ProjectClosureService } from './project-closure.service';
import { ProjectCloseReadinessService } from './project-close-readiness.service';
import { ProjectClosureReviewService } from './project-closure-review.service';

/**
 * C127 (06 v2 §41): superficie de cierre del proyecto.
 *
 * Las rutas se declaran en los commits que implementan su contrato. Mientras
 * ninguna exista, el cierre de proyecto no puede iniciarse por aquí.
 */
/** §32 «Preparación»: el líder, con el proyecto en ejecución y sin Sprint operable. */
const CLOSURE_PREPARATION_WRITE: ProjectWriteMetadata = {
  source: { kind: 'param', name: 'projectId' },
  states: ['E'],
  sprint: 'NONE_OPERABLE',
  family: 'CIERRE_PREPARACION',
};

const FASES: ClosurePhase[] = ['REQUEST', 'RESUBMIT', 'APPROVE'];

@Controller('proyectos/:projectId/cierre')
@UseGuards(JwtAuthGuard)
export class ProjectClosureController {
  constructor(
    protected readonly closure: ProjectClosureService,
    protected readonly readinessService: ProjectCloseReadinessService,
    protected readonly review: ProjectClosureReviewService,
    protected readonly report: ProjectClosureReportService,
  ) {}

  /** E103: crea el borrador de cierre o devuelve el existente. */
  @Post('preparacion')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(CLOSURE_PREPARATION_WRITE)
  prepare(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.closure.prepare(projectId, user.userId);
  }

  /**
   * E105: genera el informe automático del borrador.
   *
   * El payload solo trae la revisión: las horas y la metadata del proyecto
   * las consulta el servidor. Aceptarlas del cliente permitiría entregar un
   * informe con cifras que nadie verificó.
   */
  @Post('informe-automatico')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(CLOSURE_PREPARATION_WRITE)
  generateReport(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: GenerateReportDto,
  ) {
    return this.report.generateAutoReport(projectId, user.userId, dto.revisionId);
  }

  /** E104: qué falta para cerrar. Consultar no cambia nada. */
  @Get('readiness')
  readiness(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: { userId: number },
    @Query('phase') phase?: string,
  ) {
    const fase = (phase ?? 'REQUEST') as ClosurePhase;
    if (!FASES.includes(fase)) {
      throw new BadRequestException('phase debe ser REQUEST, RESUBMIT o APPROVE');
    }
    return this.closure.readiness(projectId, user.userId, fase);
  }
}
