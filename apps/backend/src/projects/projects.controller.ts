import { Controller, Get, Post, Param, Body, ParseIntPipe, Query } from '@nestjs/common';
import { ProjectsService } from './projects.service';

@Controller('proyectos')
export class ProjectsController {
  constructor(private projectsService: ProjectsService) {}

  @Get()
  findAll(@Query('q') q?: string) {
    return this.projectsService.findAll(q);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.projectsService.findOne(id);
  }

  @Post()
  create(@Body() data: any) {
    return this.projectsService.create(data);
  }
}
