import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateAmistadDto } from './dto/create-amistad.dto';
import { CreateSeguimientoDto } from './dto/create-seguimiento.dto';
import { SocialService } from './social.service';
import { SocialFeedService } from './social-feed.service';

@Controller('social')
@UseGuards(JwtAuthGuard)
export class SocialController {
  constructor(
    private readonly social: SocialService,
    private readonly feed: SocialFeedService,
  ) {}

  @Post('amistades')
  @HttpCode(HttpStatus.CREATED)
  crearSolicitudAmistad(@Body() dto: CreateAmistadDto, @CurrentUser() user: { userId: number }) {
    return this.social.crearSolicitudAmistad(user.userId, dto.idReceptor);
  }

  @Patch('amistades/:id/aceptar')
  aceptarSolicitudAmistad(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: { userId: number }) {
    return this.social.resolverSolicitudAmistad(user.userId, id, 'aceptar');
  }

  @Patch('amistades/:id/rechazar')
  rechazarSolicitudAmistad(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: { userId: number }) {
    return this.social.resolverSolicitudAmistad(user.userId, id, 'rechazar');
  }

  @Delete('amistades/:id')
  eliminarAmistad(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: { userId: number }) {
    return this.social.eliminarAmistad(user.userId, id);
  }

  @Get('amistades')
  listarAmigos(@CurrentUser() user: { userId: number }) {
    return this.social.listarAmigos(user.userId);
  }

  @Get('amistades/pendientes')
  listarSolicitudesPendientes(@CurrentUser() user: { userId: number }) {
    return this.social.listarSolicitudesPendientes(user.userId);
  }

  @Post('seguimientos')
  @HttpCode(HttpStatus.CREATED)
  seguirUsuario(@Body() dto: CreateSeguimientoDto, @CurrentUser() user: { userId: number }) {
    return this.social.seguirUsuario(user.userId, dto.idSeguido);
  }

  @Delete('seguimientos/:idSeguido')
  dejarDeSeguir(@Param('idSeguido', ParseIntPipe) idSeguido: number, @CurrentUser() user: { userId: number }) {
    return this.social.dejarDeSeguir(user.userId, idSeguido);
  }

  @Get('seguimientos/siguiendo')
  listarSiguiendo(@CurrentUser() user: { userId: number }) {
    return this.social.listarSiguiendo(user.userId);
  }

  @Get('seguimientos/seguidores')
  listarSeguidores(@CurrentUser() user: { userId: number }) {
    return this.social.listarSeguidores(user.userId);
  }

  @Get('usuarios/buscar')
  buscarUsuarios(@Query('q') q: string, @CurrentUser() user: { userId: number }) {
    return this.social.buscarUsuarios(user.userId, q ?? '');
  }

  @Get('feed')
  getFeed(@CurrentUser() user: { userId: number }) {
    return this.feed.getFeed(user.userId);
  }
}
