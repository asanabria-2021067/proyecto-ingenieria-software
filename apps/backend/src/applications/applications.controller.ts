import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreatePostulacionDto } from './dto/create-postulacion.dto';

@Controller('postulaciones')
export class ApplicationsController {
  constructor(private applicationsService: ApplicationsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreatePostulacionDto) {
    return this.applicationsService.create(dto);
  }

  @Get()
  findAll() {
    return this.applicationsService.findAll();
  }
}
