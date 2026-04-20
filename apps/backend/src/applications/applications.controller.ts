import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreatePostulacionDto } from './dto/create-postulacion.dto';
import { UpdateEstadoPostulacionDto } from './dto/update-estado-postulacion.dto';

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

  @Get('mis-postulaciones')
  @UseGuards(JwtAuthGuard)
  findMine(@CurrentUser() user: { userId: number }) {
    return this.applicationsService.findMine(user.userId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.applicationsService.findOne(id);
  }

  // VERIFICADO: el service valida que el usuario sea creador del proyecto
  // (ForbiddenException si rolProyecto.proyecto.creadoPor !== resolutorId)
  // y que la postulación esté en estado PENDIENTE (BadRequestException si ya fue resuelta).
  @Patch(':id/estado')
  @UseGuards(JwtAuthGuard)
  updateEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEstadoPostulacionDto,
    @CurrentUser() user: { userId: number },
  ) {
    return this.applicationsService.updateEstado(id, dto, user.userId);
  }
}
