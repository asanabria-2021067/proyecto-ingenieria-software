import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Put, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JuntaGuard } from '../associations/junta.guard';
import { SeguimientoService } from './seguimiento.service';
import { ReconocimientosService } from './reconocimientos.service';
import { RetrospectivaService } from './retrospectiva.service';
import { SprintReportService } from './sprint-report.service';
import { CrearReconocimientoDto, GuardarRetrospectivaDto } from './dto/seguimiento.dto';

type Actor = { userId: number };

function enviar(res: Response, bytes: Buffer, tipo: string, nombre: string) {
  res.setHeader('Content-Type', tipo);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
  res.setHeader('Content-Length', String(bytes.length));
  res.status(200).end(bytes);
}

/**
 * MEJ-54/55/56/57/23/24: seguimiento del proyecto y del Sprint. Todas las
 * rutas exigen JwtAuthGuard; los permisos por rol se verifican en los servicios.
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class SeguimientoController {
  constructor(
    private readonly seguimiento: SeguimientoService,
    private readonly reconocimientos: ReconocimientosService,
    private readonly retrospectiva: RetrospectivaService,
    private readonly reporte: SprintReportService,
  ) {}

  /** MEJ-54/55: hitos atrasados y semáforo del proyecto. */
  @Get('proyectos/:projectId/seguimiento')
  seguimientoProyecto(@Param('projectId', ParseIntPipe) projectId: number, @CurrentUser() user: Actor) {
    return this.seguimiento.obtener(projectId, user.userId);
  }

  /** MEJ-56: resultados de un proyecto cerrado. */
  @Get('proyectos/:projectId/resultados')
  resultados(@Param('projectId', ParseIntPipe) projectId: number, @CurrentUser() user: Actor) {
    return this.seguimiento.resultados(projectId, user.userId);
  }

  /** MEJ-56: portafolio de proyectos cerrados de una organización. */
  @Get('organizaciones/:idOrganizacion/portafolio')
  portafolioOrganizacion(@Param('idOrganizacion', ParseIntPipe) id: number, @CurrentUser() user: Actor) {
    return this.seguimiento.portafolioOrganizacion(id, user.userId);
  }

  /** MEJ-56: portafolio de proyectos cerrados de una asociación; solo su junta (JuntaGuard). */
  @Get('asociaciones/:idAsociacion/portafolio')
  @UseGuards(JuntaGuard)
  portafolioAsociacion(@Param('idAsociacion', ParseIntPipe) id: number) {
    return this.seguimiento.portafolioAsociacion(id);
  }

  /** MEJ-57: reconocimientos del Sprint. */
  @Get('proyectos/:projectId/sprints/:sprintId/reconocimientos')
  listarReconocimientos(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('sprintId', ParseIntPipe) sprintId: number,
    @CurrentUser() user: Actor,
  ) {
    return this.reconocimientos.listar(projectId, sprintId, user.userId);
  }

  /** MEJ-57: reconocer a un compañero (uno por persona por Sprint). */
  @Post('proyectos/:projectId/sprints/:sprintId/reconocimientos')
  @HttpCode(HttpStatus.CREATED)
  reconocer(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('sprintId', ParseIntPipe) sprintId: number,
    @CurrentUser() user: Actor,
    @Body() body: CrearReconocimientoDto,
  ) {
    return this.reconocimientos.crear(projectId, sprintId, user.userId, body);
  }

  /** MEJ-24: retrospectiva opcional del Sprint. */
  @Get('proyectos/:projectId/sprints/:sprintId/retrospectiva')
  obtenerRetrospectiva(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('sprintId', ParseIntPipe) sprintId: number,
    @CurrentUser() user: Actor,
  ) {
    return this.retrospectiva.obtener(projectId, sprintId, user.userId);
  }

  @Put('proyectos/:projectId/sprints/:sprintId/retrospectiva')
  guardarRetrospectiva(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('sprintId', ParseIntPipe) sprintId: number,
    @CurrentUser() user: Actor,
    @Body() body: GuardarRetrospectivaDto,
  ) {
    return this.retrospectiva.guardar(projectId, sprintId, user.userId, body);
  }

  /** MEJ-23: reporte del Sprint en CSV. */
  @Get('proyectos/:projectId/sprints/:sprintId/reporte/csv')
  async reporteCsv(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('sprintId', ParseIntPipe) sprintId: number,
    @CurrentUser() user: Actor,
    @Res() res: Response,
  ): Promise<void> {
    enviar(res, await this.reporte.csv(projectId, sprintId, user.userId), 'text/csv; charset=utf-8', `reporte-sprint-${sprintId}.csv`);
  }

  /** MEJ-23: reporte del Sprint en PDF. */
  @Get('proyectos/:projectId/sprints/:sprintId/reporte/pdf')
  async reportePdf(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('sprintId', ParseIntPipe) sprintId: number,
    @CurrentUser() user: Actor,
    @Res() res: Response,
  ): Promise<void> {
    enviar(res, await this.reporte.pdf(projectId, sprintId, user.userId), 'application/pdf', `reporte-sprint-${sprintId}.pdf`);
  }
}
