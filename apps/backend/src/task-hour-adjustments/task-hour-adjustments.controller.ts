import { Controller, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TaskHourAdjustmentsService } from './task-hour-adjustments.service';

/**
 * C070: el controller existe pero todavía NO declara handlers, y su módulo no
 * está registrado en AppModule. La superficie HTTP de los ajustes se abre en
 * C071, cuando el servicio ya cumple el contrato de §11.
 */
@Controller('proyectos/:projectId/sprints/:sprintId/asignaciones/:assignmentId/ajuste-horas')
@UseGuards(JwtAuthGuard)
export class TaskHourAdjustmentsController {
  constructor(private readonly adjustments: TaskHourAdjustmentsService) {}
}
