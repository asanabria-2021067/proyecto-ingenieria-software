import { Controller, Get, Param, ParseIntPipe, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { EstadoSprint } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ExportsService } from './exports.service';
import { buildMembersCsv } from './members-csv.builder';
import { renderProjectReportPdf } from './pdf-export.builder';
import { TipoEventoBitacora } from '../bitacora/tipos-evento-bitacora';
import { parseExportOptions, type ExportOptions } from './export-options';

/** Lo que queda en la bitácora: qué opciones se eligieron (fechas como AAAA-MM-DD). */
function detalleDeOpciones(o: ExportOptions) {
  return {
    fuente: o.fuente,
    color: o.colorTablas,
    secciones: o.secciones,
    graficas: o.graficas,
    desde: o.desde ? o.desde.toISOString().slice(0, 10) : null,
    hasta: o.hasta ? o.hasta.toISOString().slice(0, 10) : null,
  };
}

/**
 * T-259/T-260/T-261 (HU-164): exportación de datos del proyecto. Ambos
 * endpoints comparten el mismo modelo (`ExportsService.getProjectExportModel`)
 * para que sus totales coincidan entre sí y con la pantalla, y registran su
 * propia entrada de bitácora DESPUÉS de generar el archivo con éxito — un
 * fallo de generación no debe dejar un registro de "exportación" que no
 * ocurrió.
 */
@Controller('proyectos/:projectId/exportar')
@UseGuards(JwtAuthGuard)
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  @Get('csv')
  async exportCsv(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: { userId: number },
    @Res() res: Response,
    @Query() query: Record<string, unknown> = {},
  ): Promise<void> {
    // Fuente/color/gráficas no aplican a un CSV; el rango de fechas sí.
    const opciones = parseExportOptions(query);
    const modelo = await this.exportsService.getProjectExportModel(projectId, user.userId, opciones);
    const bytes = Buffer.from(buildMembersCsv(modelo), 'utf-8');
    await this.exportsService.registrarExportacion(
      projectId,
      user.userId,
      TipoEventoBitacora.PROJECT_EXPORT_CSV_GENERATED,
      detalleDeOpciones(opciones),
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `attachment; filename="miembros-horas-proyecto-${projectId}.csv"`);
    res.setHeader('Content-Length', String(bytes.length));
    res.status(200).end(bytes);
  }

  @Get('pdf')
  async exportPdf(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: { userId: number },
    @Res() res: Response,
    @Query() query: Record<string, unknown> = {},
  ): Promise<void> {
    const opciones = parseExportOptions(query);
    const modelo = await this.exportsService.getProjectExportModel(projectId, user.userId, opciones);
    // T-260 (decisión del líder de proyecto, 2026-09-22): el burndown
    // impreso es exclusivo de Sprints CERRADO — mientras el proyecto no
    // tenga ninguno, se pasa `[]` sin ni siquiera consultar la instantánea
    // del Sprint activo (`renderProjectReportPdf` interpreta `[]` como "aún
    // no disponible", no como "sin datos").
    const idsSprintsCerrados = modelo.avance.sprints
      .filter((sprint) => sprint.estado === EstadoSprint.CERRADO)
      .map((sprint) => sprint.idSprint);
    // Sin la sección burndown ni siquiera se consultan las instantáneas.
    const burndowns = opciones.secciones.includes('burndown')
      ? await this.exportsService.getBurndownForClosedSprints(projectId, idsSprintsCerrados)
      : [];
    const { pdf } = renderProjectReportPdf(modelo, burndowns, opciones);
    await this.exportsService.registrarExportacion(
      projectId,
      user.userId,
      TipoEventoBitacora.PROJECT_EXPORT_PDF_GENERATED,
      detalleDeOpciones(opciones),
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `attachment; filename="reporte-proyecto-${projectId}.pdf"`);
    res.setHeader('Content-Length', String(pdf.length));
    res.status(200).end(pdf);
  }
}
