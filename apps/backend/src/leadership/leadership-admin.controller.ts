import { Controller, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LeadershipReadService } from './leadership-read.service';
import { LeadershipService } from './leadership.service';

/**
 * C091 (06 v2 §41 E099–E102): superficie administrativa del liderazgo —
 * bandeja de apelaciones, aceptación, denegación y cambio directo.
 *
 * Vive en un controller aparte porque el actor es distinto: el administrador
 * resuelve sobre el proyecto sin ser integrante operativo del equipo. Las dos
 * rutas que transfieren llaman a la MISMA orquestación que el motor único
 * expone; no existe un segundo camino para mover el liderazgo.
 */
@Controller('admin')
@UseGuards(JwtAuthGuard)
export class LeadershipAdminController {
  constructor(
    private readonly leadershipRead: LeadershipReadService,
    private readonly leadership: LeadershipService,
  ) {}
}
