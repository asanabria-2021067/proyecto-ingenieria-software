import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ProjectWriteGuard } from '../common/guards/project-write.guard';
import { ProjectWrite, type ProjectWriteMetadata } from '../common/guards/project-write.metadata';
import { CreateLeadershipAppealDto } from './dto/create-leadership-appeal.dto';
import { LeadershipReadService } from './leadership-read.service';
import { LeadershipService } from './leadership.service';

/**
 * C093 (06 v2 §32 «Liderazgo/apelaciones»): el proyecto debe estar publicado o
 * en progreso; el Sprint ambiente es indiferente, porque quién lidera no
 * depende de la ventana de ejecución. La autorización por actor la decide el
 * service bajo el lock, que es donde `Proyecto.creadoPor` es fiable.
 */
const LEADERSHIP_WRITE: ProjectWriteMetadata = {
  source: { kind: 'param', name: 'projectId' },
  states: ['P', 'E'],
  sprint: 'ANY',
  family: 'LIDERAZGO',
};

/**
 * C091/C092 (06 v2 §41 E093–E098): superficie de liderazgo del propio
 * proyecto — contexto de Q1, candidatos, historial, apelaciones y el ciclo de
 * vida que pertenece al líder actual (crear y cancelar su apelación).
 *
 * `contexto` y `candidatos` son rutas literales y se declaran antes que
 * cualquier parámetro que pudiera capturarlas (§41).
 */
@Controller('proyectos/:projectId/liderazgo')
@UseGuards(JwtAuthGuard)
export class LeadershipController {
  constructor(
    private readonly leadershipRead: LeadershipReadService,
    private readonly leadership: LeadershipService,
  ) {}

  /** E093: foto de Q1 del líder actual; leer no crea nada. */
  @Get('contexto')
  context(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.leadershipRead.context(undefined, { projectId, actorId: user.userId });
  }

  /** E094: sucesores posibles, anotados y sin ranking. */
  @Get('candidatos')
  candidates(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.leadershipRead.candidates(undefined, { projectId, actorId: user.userId });
  }

  /** E097: el líder actual solicita que se transfiera su liderazgo. */
  @Post('apelaciones')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(LEADERSHIP_WRITE)
  createAppeal(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: CreateLeadershipAppealDto,
  ) {
    return this.leadership.createAppeal(projectId, user.userId, dto);
  }
}
