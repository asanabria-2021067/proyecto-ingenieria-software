import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { securityRequestContext } from '../security-events/request-context';
import { DesactivacionService } from './desactivacion.service';
import { ResolverDesactivacionDto } from './dto/desactivacion.dto';

/** MEJ-85: solo el administrador resuelve (el coordinador no); el servicio vuelve a verificarlo. */
@Controller('admin/solicitudes-desactivacion')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrador')
export class SolicitudesDesactivacionAdminController {
  constructor(private readonly desactivacion: DesactivacionService) {}

  @Get()
  listar(@CurrentUser() user: { userId: number }) {
    return this.desactivacion.listarPendientes(user.userId);
  }

  @Post(':id/aprobar')
  @HttpCode(200)
  aprobar(
    @CurrentUser() user: { userId: number },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResolverDesactivacionDto,
    @Req() req: Request,
  ) {
    return this.desactivacion.aprobar(user.userId, id, dto.comentario, securityRequestContext(req));
  }

  @Post(':id/rechazar')
  @HttpCode(200)
  rechazar(
    @CurrentUser() user: { userId: number },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResolverDesactivacionDto,
  ) {
    return this.desactivacion.rechazar(user.userId, id, dto.comentario);
  }
}
