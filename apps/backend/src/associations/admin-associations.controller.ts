import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AssociationsService } from './associations.service';
import { CreateAsociacionDto } from './dto/create-asociacion.dto';
import { UpdateAsociacionDto } from './dto/update-asociacion.dto';
import { ActualizarJuntaDto, AsignarJuntaDto } from './dto/junta.dto';

@Controller('admin/asociaciones')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrador')
export class AdminAssociationsController {
  constructor(private readonly service: AssociationsService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Get(':idAsociacion')
  get(@Param('idAsociacion', ParseIntPipe) id: number) {
    return this.service.get(id);
  }

  @Post()
  create(@Body() dto: CreateAsociacionDto, @CurrentUser() user: { userId: number }) {
    return this.service.create(dto, user.userId);
  }

  @Patch(':idAsociacion')
  update(@Param('idAsociacion', ParseIntPipe) id: number, @Body() dto: UpdateAsociacionDto, @CurrentUser() user: { userId: number }) {
    return this.service.update(id, dto, user.userId);
  }

  @Post(':idAsociacion/junta')
  asignar(@Param('idAsociacion', ParseIntPipe) id: number, @Body() dto: AsignarJuntaDto, @CurrentUser() user: { userId: number }) {
    return this.service.asignarJunta(id, dto, user.userId);
  }

  @Patch(':idAsociacion/junta/:idUsuario')
  actualizar(
    @Param('idAsociacion', ParseIntPipe) id: number,
    @Param('idUsuario', ParseIntPipe) idUsuario: number,
    @Body() dto: ActualizarJuntaDto,
    @CurrentUser() user: { userId: number },
  ) {
    return this.service.actualizarJunta(id, idUsuario, dto, user.userId);
  }

  @Delete(':idAsociacion/junta/:idUsuario')
  quitar(
    @Param('idAsociacion', ParseIntPipe) id: number,
    @Param('idUsuario', ParseIntPipe) idUsuario: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.service.quitarJunta(id, idUsuario, user.userId);
  }
}
