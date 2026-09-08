import {
  Body,
  Controller,
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
import { MensajesRevisionService } from './mensajes-revision.service';
import { CreateMensajeRevisionDto } from './dto/create-mensaje-revision.dto';

/**
 * C038 (06 v2 §32/§41 E037–E039): metadata explícita del canal B. El proyecto
 * se resuelve desde `params.idProyecto`; el mensaje inicial admite R/O/P/E con
 * ambiente `ANY` (S/C bloqueados por la policy). El acuse personal no lleva
 * guard de escritura de proyecto: es una excepción por usuario, repetible, sin
 * cambio de dominio ni Sprint.
 */
const REVIEW_MESSAGE_WRITE: ProjectWriteMetadata = {
  source: { kind: 'param', name: 'idProyecto' },
  states: ['R', 'O', 'P', 'E'],
  sprint: 'ANY',
  family: 'MENSAJE_REVISION',
};

@Controller('mensajes-revision')
@UseGuards(JwtAuthGuard)
export class MensajesRevisionController {
  constructor(private readonly mensajesRevisionService: MensajesRevisionService) {}

  /** E037: lectura (alcance §34 en el servicio); sin metadata de escritura. */
  @Get('proyectos/:idProyecto')
  findByProyecto(
    @Param('idProyecto', ParseIntPipe) idProyecto: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.mensajesRevisionService.findByProyecto(idProyecto, user.userId);
  }

  /** E038: mensaje de revisión inicial (líder/admin). */
  @Post('proyectos/:idProyecto')
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(REVIEW_MESSAGE_WRITE)
  create(
    @Param('idProyecto', ParseIntPipe) idProyecto: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: CreateMensajeRevisionDto,
  ) {
    return this.mensajesRevisionService.create(idProyecto, user.userId, dto);
  }

  /** E039: acuse personal (escritura por usuario sin lock de proyecto). */
  @Patch('proyectos/:idProyecto/marcar-leidos')
  markAsRead(
    @Param('idProyecto', ParseIntPipe) idProyecto: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.mensajesRevisionService.markAsRead(idProyecto, user.userId);
  }
}
