import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { ComentariosService } from '../comentarios/comentarios.service';
import { CreateTareaComentarioDto } from './dto/create-tarea-comentario.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('tareas')
export class TasksController {
  constructor(
    private tasksService: TasksService,
    private comentariosService: ComentariosService,
  ) {}

  @Get()
  findAll() {
    return this.tasksService.findAll();
  }

  @Post()
  create(@Body() data: any) {
    return this.tasksService.create(data);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() data: any) {
    return this.tasksService.update(id, data);
  }

  @Get(':id/comentarios')
  @UseGuards(JwtAuthGuard)
  findComentarios(@Param('id', ParseIntPipe) id: number) {
    return this.comentariosService.findByTareaDesc(id);
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
