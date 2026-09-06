import {
  Body,
  Controller,
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
import { DenyAppealDto } from './dto/deny-appeal.dto';
import { LeadershipReadService } from './leadership-read.service';
import { LeadershipService } from './leadership.service';

/**
 * C091/C095 (06 v2 §41 E099–E102): superficie administrativa del liderazgo —
 * bandeja de apelaciones, aceptación, denegación y cambio directo.
 *
 * Vive en un controller aparte porque el actor es distinto: el administrador
 * resuelve sobre el proyecto sin ser integrante operativo del equipo. Las dos
 * rutas que transfieren llaman a la MISMA orquestación que el motor único
 * expone; no existe un segundo camino para mover el liderazgo.
 */
const LEADERSHIP_ADMIN_WRITE: ProjectWriteMetadata = {
  source: { kind: 'param', name: 'projectId' },
  states: ['P', 'E'],
  sprint: 'ANY',
  family: 'LIDERAZGO',
};

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class LeadershipAdminController {
  constructor(
    private readonly leadershipRead: LeadershipReadService,
    private readonly leadership: LeadershipService,
  ) {}

  /** E101: denegar la apelación con un motivo, sin tocar el liderazgo. */
  @Post('proyectos/:projectId/liderazgo/apelaciones/:appealId/denegar')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(LEADERSHIP_ADMIN_WRITE)
  denyAppeal(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('appealId', ParseIntPipe) appealId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: DenyAppealDto,
  ) {
    return this.leadership.denyAppeal(projectId, appealId, user.userId, dto);
  }
}
