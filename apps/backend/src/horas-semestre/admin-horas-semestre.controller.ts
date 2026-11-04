import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { HorasSemestreService } from './horas-semestre.service';
import { HorasCentralListQueryDto, HorasCentralQueryDto } from './dto/horas-central-query.dto';
import { buildHorasCsv, renderHorasPdf } from '../exports/horas-central-report.builder';

function enviar(res: Response, bytes: Buffer, tipo: string, nombre: string) {
  res.setHeader('Content-Type', tipo);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
  res.setHeader('Content-Length', String(bytes.length));
  res.status(200).end(bytes);
}

@Controller('admin/horas-semestre')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrador', 'coordinador_academico')
export class AdminHorasSemestreController {
  constructor(private readonly service: HorasSemestreService) {}

  @Get()
  listar(@CurrentUser() user: { userId: number }, @Query() query: HorasCentralListQueryDto) {
    return this.service.listarCentral(user.userId, query);
  }

  @Get('totales')
  totales(@CurrentUser() user: { userId: number }, @Query() query: HorasCentralQueryDto) {
    return this.service.totales(user.userId, query);
  }

  @Get('comparativo')
  @Roles('administrador')
  comparativo(@CurrentUser() user: { userId: number }) {
    return this.service.comparativo(user.userId);
  }

  @Get('resumen-asociaciones')
  @Roles('administrador')
  resumenAsociaciones(@CurrentUser() user: { userId: number }, @Query() query: HorasCentralQueryDto) {
    return this.service.resumenPorAsociacion(user.userId, query);
  }

  @Get('csv')
  async csv(@CurrentUser() user: { userId: number }, @Query() query: HorasCentralQueryDto, @Res() res: Response) {
    const { semestre, filas } = await this.service.todasLasFilas(user.userId, query);
    enviar(res, Buffer.from(buildHorasCsv(filas), 'utf-8'), 'text/csv; charset=utf-8', `horas-${semestre.anio}-${semestre.periodo}.csv`);
  }

  @Get('pdf')
  async pdf(@CurrentUser() user: { userId: number }, @Query() query: HorasCentralQueryDto, @Res() res: Response) {
    const { semestre, filas } = await this.service.todasLasFilas(user.userId, query);
    const titulo = `Horas por estudiante - semestre ${semestre.periodo} de ${semestre.anio}`;
    enviar(res, renderHorasPdf(titulo, filas), 'application/pdf', `horas-${semestre.anio}-${semestre.periodo}.pdf`);
  }
}
