import { Controller, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LeadershipReadService } from './leadership-read.service';
import { LeadershipService } from './leadership.service';

/**
 * C091 (06 v2 §41 E093–E098): superficie de liderazgo del propio proyecto —
 * contexto de Q1, candidatos, historial, apelaciones y el ciclo de vida que
 * pertenece al líder actual (crear y cancelar su apelación).
 *
 * Las rutas se declaran en los commits que implementan su contrato; mientras
 * el módulo no esté registrado en `AppModule`, ninguna responde.
 */
@Controller('proyectos/:projectId/liderazgo')
@UseGuards(JwtAuthGuard)
export class LeadershipController {
  constructor(
    private readonly leadershipRead: LeadershipReadService,
    private readonly leadership: LeadershipService,
  ) {}
}
