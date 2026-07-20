import { Controller, Get, Post, Delete, Param, Body, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ComentariosService } from '../comentarios/comentarios.service';
import { CreateTareaComentarioDto } from './dto/create-tarea-comentario.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

/**
 * Extraído de TasksController (Tarea 15) para conservar exactamente las
 * rutas /tareas/:id/comentarios* sin cambios: TasksController pasó a estar
 * anidado bajo proyectos/:projectId/tareas, y mover estos métodos al mismo
 * controller habría cambiado su prefijo. Comportamiento, guards, params y
 * paths permanecen idénticos a los que tenía TasksController antes de esta
 * tarea.
 */
@Controller('tareas')
export class TareaComentariosController {
  constructor(private comentariosService: ComentariosService) {}

  @Get(':id/comentarios')
  @UseGuards(JwtAuthGuard)
  findComentarios(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.comentariosService.findByTareaDesc(id, user.userId);
  }

  @Post(':id/comentarios')
  @UseGuards(JwtAuthGuard)
  createComentario(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: CreateTareaComentarioDto,
  ) {
    return this.comentariosService.create(user.userId, {
      idTarea: id,
      contenido: dto.contenido,
    });
  }

  @Delete(':id/comentarios/:idComentario')
  @UseGuards(JwtAuthGuard)
  removeComentario(
    @Param('idComentario', ParseIntPipe) idComentario: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.comentariosService.remove(idComentario, user.userId);
  }
}
