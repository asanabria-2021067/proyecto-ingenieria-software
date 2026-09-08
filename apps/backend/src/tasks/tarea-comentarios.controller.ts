import { Controller, Get, Post, Patch, Delete, Param, Body, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ComentariosService } from '../comentarios/comentarios.service';
import { CreateTareaComentarioDto } from './dto/create-tarea-comentario.dto';
import { UpdateComentarioDto } from '../comentarios/dto/update-comentario.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ProjectWriteGuard } from '../common/guards/project-write.guard';
import { ProjectWrite, type ProjectWriteMetadata } from '../common/guards/project-write.metadata';

/**
 * C037 (06 v2 §32/§41 E034–E036): metadata explícita del canal de comentarios
 * de tarea. El proyecto se resuelve desde `params.projectId` (la tarea se
 * valida en el servicio); estados B/R/O/P/E con ambiente `ANY`, y la tarea
 * comentada debe pertenecer a un Sprint ACTIVO (entidad, verificada en el
 * servicio tras el lock). Permite la anotación prepublicación de una tarea
 * legacy existente; no abre la creación de tareas en B/R/O.
 */
const TASK_COMMENT_WRITE: ProjectWriteMetadata = {
  source: { kind: 'param', name: 'projectId' },
  states: ['B', 'R', 'O', 'P', 'E'],
  sprint: 'ANY',
  family: 'COMENTARIO_TAREA',
};

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

  /** E033: lectura (alcance §34 en el servicio); sin metadata de escritura. */
  @Get()
  findComentarios(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.comentariosService.findByTareaEnProyecto(projectId, taskId, user.userId);
  }

  /** E034: crear comentario de tarea. */
  @Post()
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(TASK_COMMENT_WRITE)
  createComentario(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: CreateTareaComentarioDto,
  ) {
    return this.comentariosService.createForTask(projectId, taskId, user.userId, dto.contenido);
  }

  /** E035: editar comentario propio de tarea. */
  @Patch(':commentId')
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(TASK_COMMENT_WRITE)
  updateComentario(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Param('commentId', ParseIntPipe) commentId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: UpdateComentarioDto,
  ) {
    return this.comentariosService.updateForTask(projectId, taskId, commentId, user.userId, dto);
  }

  /** E036: eliminar (soft) comentario propio de tarea. */
  @Delete(':commentId')
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(TASK_COMMENT_WRITE)
  removeComentario(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Param('commentId', ParseIntPipe) commentId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.comentariosService.removeForTask(projectId, taskId, commentId, user.userId);
  }
}
