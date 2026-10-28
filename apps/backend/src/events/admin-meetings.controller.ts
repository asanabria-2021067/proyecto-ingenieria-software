import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminMeetingsService } from './admin-meetings.service';
import { CreateAdminMeetingDto } from './dto/create-admin-meeting.dto';
import { UpdateAdminMeetingDto } from './dto/update-admin-meeting.dto';
import { EligibleMeetingProjectsQueryDto, ListAdminMeetingsQueryDto } from './dto/admin-meetings-query.dto';

/**
 * HU-195 (T-362): reuniones de Administración con uno o varios proyectos.
 * Toda la ruta exige sesión y rol administrador consultado en BD; editar o
 * cancelar exige además la política de la reunión (AdminMeetingsService).
 * `proyectos-elegibles` va antes de `:id` para que no se lea como un id.
 */
@Controller('admin/reuniones')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrador')
export class AdminMeetingsController {
  constructor(private readonly meetings: AdminMeetingsService) {}

  @Get()
  list(@CurrentUser() user: { userId: number }, @Query() query: ListAdminMeetingsQueryDto) {
    return this.meetings.listar(user.userId, query);
  }

  @Get('proyectos-elegibles')
  eligibleProjects(@Query() query: EligibleMeetingProjectsQueryDto) {
    return this.meetings.proyectosElegibles(query);
  }

  /** Equipo que se convocaría de un proyecto (líder e integrantes), para el formulario. */
  @Get('equipos/:idProyecto')
  projectTeam(@Param('idProyecto', ParseIntPipe) idProyecto: number) {
    return this.meetings.equipoDeProyecto(idProyecto);
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: { userId: number }) {
    return this.meetings.detalle(id, user.userId);
  }

  @Get(':id/participantes')
  participants(@Param('id', ParseIntPipe) id: number) {
    return this.meetings.participantes(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: { userId: number }, @Body() dto: CreateAdminMeetingDto) {
    return this.meetings.create(user.userId, dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: { userId: number }, @Body() dto: UpdateAdminMeetingDto) {
    return this.meetings.update(id, user.userId, dto);
  }

  /** Cancela (soft delete). Idempotente: repetirla devuelve el mismo estado sin volver a avisar. */
  @Delete(':id')
  cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: { userId: number }) {
    return this.meetings.cancel(id, user.userId);
  }
}
