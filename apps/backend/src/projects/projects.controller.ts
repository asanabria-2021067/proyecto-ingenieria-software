import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Param,
  Body,
  ParseIntPipe,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectFullDto } from './dto/create-project-full.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { UpdateEstadoProyectoDto } from './dto/update-estado-proyecto.dto';
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
    return this.projectsService.findAll({
      q,
      tipoProyecto,
      modalidad,
      organizacionId: organizacionId ? parseInt(organizacionId, 10) : undefined,
      habilidadId: habilidad ? parseInt(habilidad, 10) : undefined,
    });
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  findMine(@CurrentUser() user: { userId: number }) {
    return this.projectsService.findMine(user.userId);
  }

  @Get('mis-proyectos')
  @UseGuards(JwtAuthGuard)
  findMineLegacy(@CurrentUser() user: { userId: number }) {
    return this.projectsService.findMine(user.userId);
  }

  @Get('contributor')
  @UseGuards(JwtAuthGuard)
  findAsContributor(@CurrentUser() user: { userId: number }) {
    return this.projectsService.findAsContributor(user.userId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.projectsService.findOne(id);
  }

  @Get(':id/owner')
  @UseGuards(JwtAuthGuard)
  findOneOwner(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.projectsService.findOneOwner(id, user.userId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() data: CreateProjectFullDto,
    @CurrentUser() user: { userId: number },
  ) {
    return this.projectsService.createFull(data, user.userId);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: UpdateProjectDto,
    @CurrentUser() user: { userId: number },
  ) {
    return this.projectsService.update(id, data, user.userId);
  }

  @Patch(':id/estado')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  changeEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: UpdateEstadoProyectoDto,
    @CurrentUser() user: { userId: number },
  ) {
    return this.projectsService.changeEstado(id, user.userId, data.nuevoEstado);
  }

  @Post(':id/enviar-revision')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  submitForReview(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.projectsService.submitForReview(id, user.userId);
  }

  @Post(':id/reenviar')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  resubmit(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.projectsService.resubmit(id, user.userId);
  }

  @Post(':id/solicitar-cierre')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  requestClose(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.projectsService.requestClose(id, user.userId);
  }


  @Post(':id/aprobar-cierre')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  approveClosure(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.projectsService.approveClosure(id, user.userId);
  }


  @Post(':id/rechazar-cierre')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  rejectClosure(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.projectsService.rejectClosure(id, user.userId);
  }

  // ---------- POSTULACIONES DEL PROYECTO ----------

  @Get(':id/postulaciones')
  @UseGuards(JwtAuthGuard)
  findPostulaciones(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.projectsService.findPostulacionesByProject(id, user.userId);
  }

  // -------------------------------------------------
}
