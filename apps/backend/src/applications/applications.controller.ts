import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ProjectWriteGuard } from '../common/guards/project-write.guard';
import { ProjectWrite, type ProjectWriteMetadata } from '../common/guards/project-write.metadata';
import { CreatePostulacionDto } from './dto/create-postulacion.dto';
import { UpdateEstadoPostulacionDto } from './dto/update-estado-postulacion.dto';

/**
 * C043 (06 v2 §32/§41 E085–E090): metadata explícita de postulaciones. En la
 * creación el proyecto se resuelve desde `idRolProyecto` del body; al
 * resolver o retirar, desde la postulación de la ruta. Todas exigen P/E con
 * ambiente `ANY`; el actor concreto (propio o líder) lo verifica el servicio
 * dentro del lock.
 */
const APPLICATION_CREATE: ProjectWriteMetadata = {
  source: { kind: 'body', field: 'idRolProyecto' },
  states: ['P', 'E'],
  sprint: 'ANY',
  family: 'POSTULACION',
};
const APPLICATION_RESOLVE: ProjectWriteMetadata = {
  ...APPLICATION_CREATE,
  source: { kind: 'application', name: 'id' },
};

@Controller('postulaciones')
export class ApplicationsController {
  constructor(private applicationsService: ApplicationsService) {}

  /** E085: postular a un rol (proyecto resuelto desde el body). */
  @Post()
  @UseGuards(JwtAuthGuard, ProjectWriteGuard)
  @ProjectWrite(APPLICATION_CREATE)
  create(
    @Body() dto: CreatePostulacionDto,
    @CurrentUser() user: { userId: number },
  ) {
    return this.applicationsService.create(dto, user.userId);
  }

  /** E086: nunca un listado global; solo las propias y las de proyectos que el actor lidera. */
  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(@CurrentUser() user: { userId: number }) {
    return this.applicationsService.findAll(user.userId);
  }

  @Get('mis-postulaciones')
  @UseGuards(JwtAuthGuard)
  findMine(@CurrentUser() user: { userId: number }) {
    return this.applicationsService.findMine(user.userId);
  }

  /** E088: propia o del proyecto que el actor lidera (§34). */
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.applicationsService.findOne(id, user.userId);
  }

  // VERIFICADO: el service valida que el usuario sea creador del proyecto
  // (ForbiddenException si rolProyecto.proyecto.creadoPor !== resolutorId)
  // y que la postulación esté en estado PENDIENTE (BadRequestException si ya fue resuelta).
  /** E089: resolver la postulación (solo el líder del proyecto). */
  @Patch(':id/estado')
  @UseGuards(JwtAuthGuard, ProjectWriteGuard)
  @ProjectWrite(APPLICATION_RESOLVE)
  updateEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEstadoPostulacionDto,
    @CurrentUser() user: { userId: number },
  ) {
    return this.applicationsService.updateEstado(id, dto, user.userId);
  }

  /** E090: retirar la postulación propia mientras siga PENDIENTE. */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, ProjectWriteGuard)
  @ProjectWrite(APPLICATION_RESOLVE)
  delete(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.applicationsService.delete(id, user.userId);
  }
}
