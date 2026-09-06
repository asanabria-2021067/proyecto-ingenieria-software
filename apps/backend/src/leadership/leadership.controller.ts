import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { LeadershipReadService } from './leadership-read.service';
import { LeadershipService } from './leadership.service';

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
}
