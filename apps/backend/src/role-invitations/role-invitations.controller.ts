import { Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Query, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RoleInvitationsService } from './role-invitations.service';
import { CreateInvitacionRolDto } from './dto/create-invitacion-rol.dto';

const enteros = (texto?: string): number[] =>
  (texto ?? '')
    .split(',')
    .map((v) => Number.parseInt(v, 10))
    .filter((n) => Number.isInteger(n) && n > 0);
const entero = (texto?: string): number | undefined => enteros(texto)[0];

/** MEJ-22/62: los permisos (líder invita, invitado responde) se verifican en el servicio. */
@Controller('invitaciones-rol')
@UseGuards(JwtAuthGuard)
export class RoleInvitationsController {
  constructor(private readonly service: RoleInvitationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  invitar(@Body() dto: CreateInvitacionRolDto, @CurrentUser() user: { userId: number }) {
    return this.service.invitar(user.userId, dto);
  }

  @Get('mias')
  mias(@CurrentUser() user: { userId: number }) {
    return this.service.mias(user.userId);
  }

  @Get('sugerencias')
  sugerencias(
    @Query('habilidades') habilidades: string | undefined,
    @Query('carrera') carrera: string | undefined,
    @Query('proyecto') proyecto: string | undefined,
    @Query('limite') limite: string | undefined,
    @CurrentUser() user: { userId: number },
  ) {
    return this.service.sugerencias(user.userId, {
      habilidades: enteros(habilidades),
      idCarrera: entero(carrera),
      idProyecto: entero(proyecto),
      limite: entero(limite),
    });
  }

  @Post(':id/aceptar')
  @HttpCode(HttpStatus.OK)
  aceptar(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: { userId: number }) {
    return this.service.responder(user.userId, id, true);
  }

  @Post(':id/rechazar')
  @HttpCode(HttpStatus.OK)
  rechazar(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: { userId: number }) {
    return this.service.responder(user.userId, id, false);
  }
}
