import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ProjectWriteGuard } from '../common/guards/project-write.guard';
import { ProjectWrite, type ProjectWriteMetadata } from '../common/guards/project-write.metadata';
import { PlantillasTareaService } from './plantillas-tarea.service';
import { CreatePlantillaTareaDto } from './dto/plantilla-tarea.dto';

/** Configuracion solo del lider, como las etiquetas: cualquier estado vivo, sin Sprint. */
const PLANTILLA_WRITE: ProjectWriteMetadata = {
  source: { kind: 'param', name: 'projectId' },
  states: ['B', 'R', 'O', 'P', 'E'],
  sprint: 'ANY',
  family: 'ETIQUETA_CRUD',
};

/** MEJ-52: permisos (lectura del tablero / lider) los decide PlantillasTareaService. */
@Controller('proyectos/:projectId/plantillas-tarea')
@UseGuards(JwtAuthGuard)
export class PlantillasTareaController {
  constructor(private readonly plantillas: PlantillasTareaService) {}

  @Get()
  list(@Param('projectId', ParseIntPipe) projectId: number, @CurrentUser() user: { userId: number }) {
    return this.plantillas.list(projectId, user.userId);
  }

  @Post()
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(PLANTILLA_WRITE)
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: CreatePlantillaTareaDto,
  ) {
    return this.plantillas.create(projectId, user.userId, dto);
  }

  @Delete(':plantillaId')
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(PLANTILLA_WRITE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('plantillaId', ParseIntPipe) plantillaId: number,
    @CurrentUser() user: { userId: number },
  ): Promise<void> {
    await this.plantillas.remove(projectId, plantillaId, user.userId);
  }
}
