import { Controller, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HistoricalProjectReadService } from './historical-project-read.service';

/**
 * C121 (06 v2 §38/§41 E116–E117): bandeja y detalle administrativos.
 *
 * Da al administrador LECTURA, nunca autoridad operativa sobre el equipo: ver
 * un proyecto no convierte a nadie en su líder.
 */
@Controller('admin/proyectos')
@UseGuards(JwtAuthGuard)
export class AdminProjectsController {
  constructor(protected readonly historical: HistoricalProjectReadService) {}
}
