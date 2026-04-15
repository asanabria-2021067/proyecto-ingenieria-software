import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  ParseIntPipe,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('proyectos')
export class ProjectsController {
  constructor(private projectsService: ProjectsService) {}

  @Get()
  findAll(
    @Query('q') q?: string,
    @Query('tipoProyecto') tipoProyecto?: string,
    @Query('modalidad') modalidad?: string,
    @Query('organizacionId') organizacionId?: string,
    @Query('habilidad') habilidad?: string,
  ) {
    return this.projectsService.findAll(
      q,
      tipoProyecto,
      modalidad,
      organizacionId ? parseInt(organizacionId, 10) : undefined,
      habilidad,
    );
  }

  @Get(':id/postulaciones')
  @UseGuards(JwtAuthGuard)
  findPostulaciones(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.projectsService.findByProyecto(id, user.userId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.projectsService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() data: CreateProjectDto,
    @CurrentUser() user: { userId: number; correo: string },
  ) {
    return this.projectsService.create(data, user.userId);
  }
}