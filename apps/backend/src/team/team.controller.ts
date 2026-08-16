import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TeamService } from './team.service';

@Controller('proyectos')
export class TeamController {
  constructor(private teamService: TeamService) {}

  @Get(':id/miembros/postulaciones-pendientes')
  @UseGuards(JwtAuthGuard)
  getPendingPostulations(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.teamService.getPendingPostulations(id, user.userId);
  }

  @Get(':id/equipo')
  @UseGuards(JwtAuthGuard)
  findTeam(@Param('id', ParseIntPipe) id: number) {
    return this.teamService.findTeam(id);
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
}
