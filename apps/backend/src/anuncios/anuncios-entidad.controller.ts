import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JuntaGuard } from '../associations/junta.guard';
import { AnunciosEntidadService } from './anuncios-entidad.service';
import { CreateAnuncioEntidadDto } from './dto/create-anuncio-entidad.dto';

type Actor = { userId: number };

/** Permisos por rol en el servicio; el actor sale siempre del JWT. */
@Controller('organizaciones/:id/anuncios')
@UseGuards(JwtAuthGuard)
export class OrganizacionAnunciosController {
  constructor(private service: AnunciosEntidadService) {}

  @Get()
  listar(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: Actor) {
    return this.service.listarOrganizacion(user.userId, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  crear(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateAnuncioEntidadDto, @CurrentUser() user: Actor) {
    return this.service.crearOrganizacion(user.userId, id, dto);
  }

  @Patch(':idAnuncio/despublicar')
  despublicar(@Param('id', ParseIntPipe) id: number, @Param('idAnuncio', ParseIntPipe) idAnuncio: number, @CurrentUser() user: Actor) {
    return this.service.despublicarOrganizacion(user.userId, id, idAnuncio);
  }
}

/** Solo la junta de la asociación; publican el Presidente y los Editores. */
@Controller('asociaciones/:idAsociacion/anuncios')
@UseGuards(JwtAuthGuard, JuntaGuard)
export class AsociacionAnunciosController {
  constructor(private service: AnunciosEntidadService) {}

  @Get()
  listar(@Param('idAsociacion', ParseIntPipe) id: number) {
    return this.service.listarAsociacion(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  crear(@Param('idAsociacion', ParseIntPipe) id: number, @Body() dto: CreateAnuncioEntidadDto, @CurrentUser() user: Actor) {
    return this.service.crearAsociacion(user.userId, id, dto);
  }

  @Patch(':idAnuncio/despublicar')
  despublicar(
    @Param('idAsociacion', ParseIntPipe) id: number,
    @Param('idAnuncio', ParseIntPipe) idAnuncio: number,
    @CurrentUser() user: Actor,
  ) {
    return this.service.despublicarAsociacion(user.userId, id, idAnuncio);
  }
}
