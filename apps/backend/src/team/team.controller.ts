import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BajaIntegranteDto } from './dto/baja-integrante.dto';
import { TeamGestionService } from './team-gestion.service';
import { TeamService } from './team.service';

@Controller('proyectos')
export class TeamController {
  constructor(
    private teamService: TeamService,
    private gestion: TeamGestionService,
  ) {}

  /** MEJ-104: tareas abiertas y horas (semana y Sprint activo) por integrante activo. */
  @Get(':id/carga-equipo')
  @UseGuards(JwtAuthGuard)
  cargaEquipo(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: { userId: number }) {
    return this.gestion.cargaEquipo(id, user.userId);
  }

  /** MEJ-105: baja de un integrante; solo administración (el servicio lo verifica). */
  @Post(':id/equipo/:idUsuario/baja')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  darDeBaja(
    @Param('id', ParseIntPipe) id: number,
    @Param('idUsuario', ParseIntPipe) idUsuario: number,
    @Body() dto: BajaIntegranteDto,
    @CurrentUser() user: { userId: number },
  ) {
    return this.gestion.darDeBaja(id, idUsuario, user.userId, dto.motivo);
  }

  @Get(':id/miembros/postulaciones-pendientes')
  @UseGuards(JwtAuthGuard)
  getPendingPostulations(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.teamService.getPendingPostulations(id, user.userId);
  }

  /** E081: integrantes del proyecto (incluye históricos anotados) según §34. */
  @Get(':id/equipo')
  @UseGuards(JwtAuthGuard)
  findTeam(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.teamService.findTeam(id, user.userId);
  }

  @Get(':id/equipo/:idUsuario')
  @UseGuards(JwtAuthGuard)
  findTeamMemberDetail(
    @Param('id', ParseIntPipe) id: number,
    @Param('idUsuario', ParseIntPipe) idUsuario: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.teamService.findTeamMemberDetail(id, idUsuario, user.userId);
  }

  @Get(':id/miembros/resumen')
  @UseGuards(JwtAuthGuard)
  getTeamSummary(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.teamService.getTeamSummary(id, user.userId);
  }

  @Get(':id/miembros/solicitudes-salida-pendientes')
  @UseGuards(JwtAuthGuard)
  getPendingExitRequests(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.teamService.getPendingExitRequests(id, user.userId);
  }
}
