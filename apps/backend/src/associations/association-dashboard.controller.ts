import { Controller, Get, Param, ParseIntPipe, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { buildHorasCsv, renderHorasPdf } from '../exports/horas-central-report.builder';
import { buildProyectosAsociacionCsv, renderProyectosAsociacionPdf } from '../exports/proyectos-asociacion-report.builder';
import { AssociationDashboardService } from './association-dashboard.service';
import { DashboardEstudiantesQueryDto, DashboardReporteQueryDto } from './dto/dashboard-query.dto';
import { JuntaGuard } from './junta.guard';

type ReqJunta = { junta: { asociacion: { nombre: string } } };

function enviar(res: Response, bytes: Buffer, tipo: string, nombre: string) {
  res.setHeader('Content-Type', tipo);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
  res.setHeader('Content-Length', String(bytes.length));
  res.status(200).end(bytes);
}

/** Dashboard de asociacion: solo lectura, solo para la junta de `:idAsociacion`. */
@Controller('asociaciones/:idAsociacion')
@UseGuards(JwtAuthGuard, JuntaGuard)
export class AssociationDashboardController {
  constructor(private readonly service: AssociationDashboardService) {}

  @Get('estudiantes')
  estudiantes(@Param('idAsociacion', ParseIntPipe) id: number, @Query() query: DashboardEstudiantesQueryDto) {
    return this.service.estudiantes(id, query);
  }

  @Get('estudiantes/csv')
  async estudiantesCsv(@Param('idAsociacion', ParseIntPipe) id: number, @Query() query: DashboardReporteQueryDto, @Res() res: Response) {
    const { semestre, filas } = await this.service.todosLosEstudiantes(id, query);
    const nombre = `${query.enRiesgo ? 'en-riesgo' : 'estudiantes'}-${semestre.anio}-${semestre.periodo}.csv`;
    enviar(res, Buffer.from(buildHorasCsv(filas), 'utf-8'), 'text/csv; charset=utf-8', nombre);
  }

  @Get('estudiantes/pdf')
  async estudiantesPdf(
    @Param('idAsociacion', ParseIntPipe) id: number,
    @Query() query: DashboardReporteQueryDto,
    @Req() req: ReqJunta,
    @Res() res: Response,
  ) {
    const { semestre, filas } = await this.service.todosLosEstudiantes(id, query);
    const lista = query.enRiesgo ? 'Estudiantes en riesgo' : 'Estudiantes';
    const titulo = `${lista} - ${req.junta.asociacion.nombre} - semestre ${semestre.periodo} de ${semestre.anio}`;
    const nombre = `${query.enRiesgo ? 'en-riesgo' : 'estudiantes'}-${semestre.anio}-${semestre.periodo}.pdf`;
    enviar(res, renderHorasPdf(titulo, filas), 'application/pdf', nombre);
  }

  @Get('proyectos')
  proyectos(@Param('idAsociacion', ParseIntPipe) id: number) {
    return this.service.proyectos(id);
  }

  @Get('proyectos/csv')
  async proyectosCsv(@Param('idAsociacion', ParseIntPipe) id: number, @Res() res: Response) {
    const filas = await this.service.proyectos(id);
    enviar(res, Buffer.from(buildProyectosAsociacionCsv(filas), 'utf-8'), 'text/csv; charset=utf-8', 'proyectos.csv');
  }

  @Get('proyectos/pdf')
  async proyectosPdf(@Param('idAsociacion', ParseIntPipe) id: number, @Req() req: ReqJunta, @Res() res: Response) {
    const filas = await this.service.proyectos(id);
    enviar(res, renderProyectosAsociacionPdf(`Proyectos - ${req.junta.asociacion.nombre}`, filas), 'application/pdf', 'proyectos.pdf');
  }
}
