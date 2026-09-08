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
import { ApproveClosureDto, CorrectionDto, GenerateReportDto, RequestCloseDto, ResubmitClosureDto, ReturnExecutionDto } from './dto/closure.dto';
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

@Controller('proyectos/:projectId')
@UseGuards(JwtAuthGuard)
export class ProjectClosureController {
  constructor(
    protected readonly closure: ProjectClosureService,
    protected readonly readinessService: ProjectCloseReadinessService,
    protected readonly review: ProjectClosureReviewService,
    protected readonly report: ProjectClosureReportService,
  ) {}

  @Post('aprobar-cierre')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite({ source: { kind: 'param', name: 'projectId' }, states: ['S'], sprint: 'NONE_OPERABLE', family: 'CIERRE_VEREDICTO' })
  approve(@Param('projectId', ParseIntPipe) projectId: number, @CurrentUser() user: { userId: number }, @Body() dto: ApproveClosureDto) {
    return this.review.approveClosure(projectId, user.userId, dto);
  }

  @Post('rechazar-cierre')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite({ source: { kind: 'param', name: 'projectId' }, states: ['S'], sprint: 'NONE_OPERABLE', family: 'CIERRE_VEREDICTO' })
  returnToExecution(@Param('projectId', ParseIntPipe) projectId: number, @CurrentUser() user: { userId: number }, @Body() dto: ReturnExecutionDto) {
    return this.review.returnToExecution(projectId, user.userId, dto);
  }

  @Post('cierre/reenviar')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite({ source: { kind: 'param', name: 'projectId' }, states: ['S'], sprint: 'NONE_OPERABLE', family: 'CIERRE_ENVIO' })
  resubmit(@Param('projectId', ParseIntPipe) projectId: number, @CurrentUser() user: { userId: number }, @Body() dto: ResubmitClosureDto) {
    return this.closure.resubmit(projectId, user.userId, dto);
  }

  /** E103: crea el borrador de cierre o devuelve el existente. */
  @Post('cierre/correccion-documental')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite({ source: { kind: 'param', name: 'projectId' }, states: ['S'], sprint: 'NONE_OPERABLE', family: 'CIERRE_VEREDICTO' })
  correction(@Param('projectId', ParseIntPipe) projectId: number, @CurrentUser() user: { userId: number }, @Body() dto: CorrectionDto) {
    return this.review.requestDocumentaryCorrection(projectId, user.userId, dto);
  }

  @Get('cierre/revisiones')
  listRevisions(@Param('projectId', ParseIntPipe) projectId: number, @CurrentUser() user: { userId: number },
    @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.closure.listRevisions(projectId, user.userId, page === undefined ? 1 : Number(page), limit === undefined ? 20 : Number(limit));
  }

  @Get('cierre/revisiones/:numero')
  getRevision(@Param('projectId', ParseIntPipe) projectId: number, @CurrentUser() user: { userId: number }, @Param('numero', ParseIntPipe) numero: number) {
    return this.closure.getRevision(projectId, user.userId, numero);
  }

  @Post('cierre/preparacion')
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
  @Post('cierre/informe-automatico')
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
  @Post('solicitar-cierre')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite({ ...CLOSURE_PREPARATION_WRITE, family: 'CIERRE_ENVIO' })
  requestClose(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: RequestCloseDto,
  ) {
    return this.closure.requestClose(projectId, user.userId, dto);
  }

  @Get('cierre/readiness')
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
