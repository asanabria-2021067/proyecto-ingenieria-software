import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreatePostulacionDto } from './dto/create-postulacion.dto';

@Controller('postulaciones')
export class ApplicationsController {
  constructor(private applicationsService: ApplicationsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @Body() dto: CreatePostulacionDto,
    @CurrentUser() user: { userId: number },
  ) {
    return this.applicationsService.create(dto, user.userId);
  }

  @Get()
  findAll() {
    return this.applicationsService.findAll();
  }
}
