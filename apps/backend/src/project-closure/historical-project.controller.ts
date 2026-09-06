import { Controller, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HistoricalProjectReadService } from './historical-project-read.service';

/**
 * C121 (06 v2 §38/§41 E118): lectura histórica de un proyecto.
 *
 * Es una superficie AUTENTICADA y aparte del `GET` público de proyecto, que
 * sigue limitado a publicado y en progreso: cerrar un proyecto no lo hace
 * público, solo lo hace legible para quienes participaron en él.
 */
@Controller('proyectos/:projectId')
@UseGuards(JwtAuthGuard)
export class HistoricalProjectController {
  constructor(protected readonly historical: HistoricalProjectReadService) {}
}
