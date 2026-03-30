import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApplicationsService } from './applications.service';

@Controller('postulaciones')
export class ApplicationsController {
  constructor(private applicationsService: ApplicationsService) {}

  @Post()
  create(@Body() data: any) {
    return this.applicationsService.create(data);
  }

  @Get()
  findAll() {
    return this.applicationsService.findAll();
  }
}
