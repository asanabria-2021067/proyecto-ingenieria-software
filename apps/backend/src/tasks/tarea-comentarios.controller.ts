import { Controller, Get, Post, Patch, Delete, Param, Body, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ComentariosService } from '../comentarios/comentarios.service';
import { CreateTareaComentarioDto } from './dto/create-tarea-comentario.dto';
import { UpdateComentarioDto } from '../comentarios/dto/update-comentario.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

/**
 * Tarea 28: migrado de `tareas/:id/comentarios*` (proyecto implícito) a
 * rutas completamente anidadas y contextualizadas bajo
 * `proyectos/:projectId/tareas/:taskId/comentarios`. Cada operación delega
 * en los métodos contextualizados de ComentariosService
 * (findByTareaEnProyecto/createForTask/updateForTask/removeForTask), que
 * validan proyecto+tarea en base de datos antes de aplicar las mismas
 * reglas de autorización que ya existían. El controller no valida nada por
 * sí mismo ni consulta Prisma directamente.
 */
@Controller('proyectos/:projectId/tareas/:taskId/comentarios')
@UseGuards(JwtAuthGuard)
export class TareaComentariosController {
  constructor(private comentariosService: ComentariosService) {}

  @Get()
  findComentarios(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.comentariosService.findByTareaEnProyecto(projectId, taskId, user.userId);
  }

  @Post()
  createComentario(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: CreateTareaComentarioDto,
  ) {
    return this.comentariosService.createForTask(projectId, taskId, user.userId, dto.contenido);
  }

  @Patch(':commentId')
  updateComentario(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Param('commentId', ParseIntPipe) commentId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: UpdateComentarioDto,
  ) {
    return this.comentariosService.updateForTask(projectId, taskId, commentId, user.userId, dto);
  }

  @Delete(':commentId')
  removeComentario(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Param('commentId', ParseIntPipe) commentId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.comentariosService.removeForTask(projectId, taskId, commentId, user.userId);
  }
}
