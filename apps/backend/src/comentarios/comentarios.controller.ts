import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ComentariosService } from './comentarios.service';
import { CreateComentarioDto } from './dto/create-comentario.dto';
import { UpdateComentarioDto } from './dto/update-comentario.dto';

@Controller('comentarios')
@UseGuards(JwtAuthGuard)
export class ComentariosController {
  constructor(private readonly comentariosService: ComentariosService) {}

  @Post()
  create(
    @CurrentUser() user: { userId: number },
    @Body() dto: CreateComentarioDto,
  ) {
    return this.comentariosService.create(user.userId, dto);
  }

  @Get('proyecto/:idProyecto')
  findByProyecto(@Param('idProyecto', ParseIntPipe) idProyecto: number) {
    return this.comentariosService.findByProyecto(idProyecto);
  }

  @Get('tarea/:idTarea')
  findByTarea(@Param('idTarea', ParseIntPipe) idTarea: number) {
    return this.comentariosService.findByTarea(idTarea);
  }

  @Get('hito/:idHito')
  findByHito(@Param('idHito', ParseIntPipe) idHito: number) {
    return this.comentariosService.findByHito(idHito);
  }

  @Patch(':idComentario')
  update(
    @Param('idComentario', ParseIntPipe) idComentario: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: UpdateComentarioDto,
  ) {
    return this.comentariosService.update(idComentario, user.userId, dto);
  }

  @Delete(':idComentario')
  remove(
    @Param('idComentario', ParseIntPipe) idComentario: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.comentariosService.remove(idComentario, user.userId);
  }
}
