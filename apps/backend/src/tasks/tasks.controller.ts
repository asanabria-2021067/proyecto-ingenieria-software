import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { ComentariosService } from '../comentarios/comentarios.service';
import { CreateTareaComentarioDto } from './dto/create-tarea-comentario.dto';
import { CreateTareaDto } from './dto/create-tarea.dto';
import { UpdateTareaDto } from './dto/update-tarea.dto';
import { AssignTareaDto } from './dto/assign-tarea.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('tareas')
export class TasksController {
  constructor(
    private tasksService: TasksService,
    private comentariosService: ComentariosService,
  ) {}

  @Get()
  findAll(@Query('idProyecto') idProyecto?: string) {
    return this.tasksService.findAll(idProyecto ? Number(idProyecto) : undefined);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.tasksService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreateTareaDto, @CurrentUser() user: { userId: number }) {
    return this.tasksService.create(dto, user.userId);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTareaDto) {
    return this.tasksService.update(id, dto);
  }

  @Post(':id/asignaciones')
  @UseGuards(JwtAuthGuard)
  assign(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignTareaDto,
    @CurrentUser() user: { userId: number },
  ) {
    return this.tasksService.assign(id, dto.idUsuario, user.userId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.tasksService.remove(id);
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
