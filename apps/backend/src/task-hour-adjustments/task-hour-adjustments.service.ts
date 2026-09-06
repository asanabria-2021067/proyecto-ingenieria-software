import { Injectable } from '@nestjs/common';
import { UpsertHourAdjustmentDto } from './dto/upsert-hour-adjustment.dto';

/**
 * C070 (06 v2 §11/§38): esqueleto del servicio de ajustes del líder. Las tres
 * firmas quedan fijadas aquí — `upsert`, `revert`, `history` — y su cuerpo
 * llega en C071/C072, cuando el módulo se registra y las rutas existen.
 *
 * El ajuste NUNCA reescribe el reporte del integrante: se ancla en
 * `idAsignacion` y compone la propuesta del tramo como caché + delta vigente.
 */
@Injectable()
export class TaskHourAdjustmentsService {
  async upsert(
    _projectId: number,
    _sprintId: number,
    _assignmentId: number,
    _actorId: number,
    _dto: UpsertHourAdjustmentDto,
  ): Promise<never> {
    throw new Error('TaskHourAdjustmentsService.upsert todavía no está implementado');
  }

  async revert(
    _projectId: number,
    _sprintId: number,
    _assignmentId: number,
    _actorId: number,
  ): Promise<never> {
    throw new Error('TaskHourAdjustmentsService.revert todavía no está implementado');
  }

  async history(
    _projectId: number,
    _sprintId: number,
    _assignmentId: number,
    _actorId: number,
  ): Promise<never> {
    throw new Error('TaskHourAdjustmentsService.history todavía no está implementado');
  }
}
