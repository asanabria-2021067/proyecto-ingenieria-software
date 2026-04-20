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
  Patch,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectStatusDto } from './dto/update-project-status.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('proyectos')
export class ProjectsController {
  constructor(private projectsService: ProjectsService) {}

  @Get()
  findAll(@Query('q') q?: string) {
    return this.projectsService.findAll(q);
  }

  @UseGuards(JwtAuthGuard)
  @Get('mis-proyectos')
  findMine(@CurrentUser() user: { userId: number; correo: string }) {
    return this.projectsService.findMine(user.userId);
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

  @Patch(':id/estado')
  @UseGuards(JwtAuthGuard)
  updateEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProjectStatusDto,
    @CurrentUser() user: { userId: number; correo: string },
  ) {
    return this.projectsService.updateEstado(id, dto, user.userId);
  }
}
