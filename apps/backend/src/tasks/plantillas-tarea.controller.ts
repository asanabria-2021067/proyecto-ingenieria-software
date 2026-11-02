import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PlantillasTareaService } from './plantillas-tarea.service';
import { CreatePlantillaTareaDto } from './dto/plantilla-tarea.dto';

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
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: CreatePlantillaTareaDto,
  ) {
    return this.plantillas.create(projectId, user.userId, dto);
  }

  @Delete(':plantillaId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('plantillaId', ParseIntPipe) plantillaId: number,
    @CurrentUser() user: { userId: number },
  ): Promise<void> {
    await this.plantillas.remove(projectId, plantillaId, user.userId);
  }
}
