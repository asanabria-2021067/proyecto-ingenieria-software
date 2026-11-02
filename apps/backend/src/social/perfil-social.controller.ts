import { Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { renderTablaPdf } from '../exports/horas-central-report.builder';
import { PerfilSocialService } from './perfil-social.service';

type Actor = { userId: number };

/** Permisos en el servicio: todo se filtra por quien mira, el actor sale siempre del JWT. */
@Controller('social')
@UseGuards(JwtAuthGuard)
export class PerfilSocialController {
  constructor(private readonly service: PerfilSocialService) {}

  @Get('usuarios/:id/resumen')
  resumen(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: Actor) {
    return this.service.resumen(user.userId, id);
  }

  @Get('usuarios/:id/actividad')
  actividad(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: Actor) {
    return this.service.actividad(user.userId, id);
  }

  @Get('usuarios/:id/cv')
  cv(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: Actor) {
    return this.service.cv(user.userId, id);
  }

  @Get('usuarios/:id/cv/pdf')
  async cvPdf(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: Actor, @Res() res: Response) {
    const cv = await this.service.cv(user.userId, id);
    const filas = cv.proyectos.map((p) => [p.titulo, p.rol, p.inicio ?? '-', p.fin ?? '-', p.horasAcreditadas]);
    filas.push(['Total', '', '', '', cv.totalHorasAcreditadas]);
    const bytes = renderTablaPdf(
      `CV de proyectos - ${cv.nombre}${cv.carrera ? ` - ${cv.carrera}` : ''}`,
      ['Proyecto', 'Rol', 'Inicio', 'Fin', 'Horas acreditadas'],
      filas,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'attachment; filename="cv-proyectos.pdf"');
    res.setHeader('Content-Length', String(bytes.length));
    res.status(200).end(bytes);
  }

  @Post('amistades/:idAmigo/mensaje')
  @HttpCode(HttpStatus.OK)
  mensaje(@Param('idAmigo', ParseIntPipe) idAmigo: number, @CurrentUser() user: Actor) {
    return this.service.abrirMensajeDirecto(user.userId, idAmigo);
  }
}
