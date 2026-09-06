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
import { ProjectWriteGuard } from '../common/guards/project-write.guard';
import { ProjectWrite, type ProjectWriteMetadata } from '../common/guards/project-write.metadata';
import { ComentariosService } from './comentarios.service';
import { CreateComentarioDto } from './dto/create-comentario.dto';
import { UpdateComentarioDto } from './dto/update-comentario.dto';

/**
 * C036 (06 v2 §32/§41 E028–E032): metadata explícita del canal A
 * (proyecto/hito). En POST el proyecto llega en el body (`idProyecto` o
 * `idHito`; un `idTarea` se resuelve solo para que el servicio lo rechace con
 * su 400 propio); en PATCH/DELETE se resuelve desde el comentario. Estados
 * B/R/O/P/E con ambiente `ANY`: S/C quedan bloqueados por la policy.
 */
const COMMENT_CREATE: ProjectWriteMetadata = {
  source: [
    { kind: 'body', field: 'idProyecto' },
    { kind: 'hito', from: 'body', name: 'idHito' },
    { kind: 'task', from: 'body', name: 'idTarea' },
  ],
  states: ['B', 'R', 'O', 'P', 'E'],
  sprint: 'ANY',
  family: 'COMENTARIO_PROYECTO_HITO',
};
const COMMENT_EDIT: ProjectWriteMetadata = {
  ...COMMENT_CREATE,
  source: { kind: 'comment', name: 'idComentario' },
};

@Controller('comentarios')
@UseGuards(JwtAuthGuard)
export class ComentariosController {
  constructor(private readonly comentariosService: ComentariosService) {}

  /** E028: crear comentario de proyecto/hito. */
  @Post()
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(COMMENT_CREATE)
  create(
    @CurrentUser() user: { userId: number },
    @Body() dto: CreateComentarioDto,
  ) {
    return this.comentariosService.create(user.userId, dto);
  }

  /** E029: lectura (alcance §34 en el servicio); sin metadata de escritura. */
  @Get('proyecto/:idProyecto')
  findByProyecto(
    @Param('idProyecto', ParseIntPipe) idProyecto: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.comentariosService.findByProyecto(idProyecto, user.userId);
  }

  /** E030: lectura (alcance §34 en el servicio); sin metadata de escritura. */
  @Get('hito/:idHito')
  findByHito(
    @Param('idHito', ParseIntPipe) idHito: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.comentariosService.findByHito(idHito, user.userId);
  }

  /** E031: editar comentario propio. */
  @Patch(':idComentario')
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(COMMENT_EDIT)
  update(
    @Param('idComentario', ParseIntPipe) idComentario: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: UpdateComentarioDto,
  ) {
    return this.comentariosService.update(idComentario, user.userId, dto);
  }

  /** E032: eliminar (soft) comentario propio. */
  @Delete(':idComentario')
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(COMMENT_EDIT)
  remove(
    @Param('idComentario', ParseIntPipe) idComentario: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.comentariosService.remove(idComentario, user.userId);
  }
}
