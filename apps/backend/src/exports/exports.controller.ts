import { Controller, Get, Param, ParseIntPipe, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ExportsService } from './exports.service';
import { buildMembersCsv } from './members-csv.builder';
import { renderProjectReportPdf } from './pdf-export.builder';
import { TipoEventoBitacora } from '../bitacora/tipos-evento-bitacora';

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
  ): Promise<void> {
    const modelo = await this.exportsService.getProjectExportModel(projectId, user.userId);
    const bytes = Buffer.from(buildMembersCsv(modelo), 'utf-8');
    await this.exportsService.registrarExportacion(
      projectId,
      user.userId,
      TipoEventoBitacora.PROJECT_EXPORT_CSV_GENERATED,
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
  ): Promise<void> {
    const modelo = await this.exportsService.getProjectExportModel(projectId, user.userId);
    const { pdf } = renderProjectReportPdf(modelo);
    await this.exportsService.registrarExportacion(
      projectId,
      user.userId,
      TipoEventoBitacora.PROJECT_EXPORT_PDF_GENERATED,
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `attachment; filename="reporte-proyecto-${projectId}.pdf"`);
    res.setHeader('Content-Length', String(pdf.length));
    res.status(200).end(pdf);
  }
}
