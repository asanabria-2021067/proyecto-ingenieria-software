import { Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EjemploProyectoService } from './ejemplo-proyecto.service';

// Solo el líder del proyecto: el servicio lo valida con el lock del proyecto.
@Controller('proyectos/:projectId/ejemplo')
@UseGuards(JwtAuthGuard)
export class EjemploProyectoController {
  constructor(private readonly service: EjemploProyectoService) {}

  @Get()
  estado(@Param('projectId', ParseIntPipe) projectId: number, @CurrentUser() user: { userId: number }) {
    return this.service.estado(projectId, user.userId);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  crear(@Param('projectId', ParseIntPipe) projectId: number, @CurrentUser() user: { userId: number }) {
    return this.service.crear(projectId, user.userId);
  }

  @Delete()
  eliminar(@Param('projectId', ParseIntPipe) projectId: number, @CurrentUser() user: { userId: number }) {
    return this.service.eliminar(projectId, user.userId);
  }
}
