import { Module } from '@nestjs/common';
import { EligibilityModule } from '../eligibility/eligibility.module';
import { TimeRecordsModule } from '../time-records/time-records.module';
import { TasksController } from './tasks.controller';
import { TareaComentariosController } from './tarea-comentarios.controller';
import { TasksService } from './tasks.service';
import { TasksNotificationsService } from './tasks-notifications.service';
import { TasksBulkService } from './tasks-bulk.service';
import { TasksContextService } from './tasks-context.service';
import { TasksAuthorizationService } from './tasks-authorization.service';
import { TasksRelationsService } from './tasks-relations.service';
import { TasksDueReminderService } from './tasks-due-reminder.service';
import { TasksExtrasController } from './tasks-extras.controller';
import { TasksExtrasService } from './tasks-extras.service';
import { PlantillasTareaController } from './plantillas-tarea.controller';
import { PlantillasTareaService } from './plantillas-tarea.service';
import { TasksRecurrenceService } from './tasks-recurrence.service';
import { WeeklySummaryService } from './weekly-summary.service';
import { ComentariosModule } from '../comentarios/comentarios.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SprintsModule } from '../sprints/sprints.module';
import { ProjectPolicyModule } from '../common/project-policy/project-policy.module';
import { BitacoraModule } from '../bitacora/bitacora.module';

@Module({
  imports: [ProjectPolicyModule, ComentariosModule, NotificationsModule, SprintsModule, BitacoraModule, TimeRecordsModule, EligibilityModule],
  controllers: [TasksController, TareaComentariosController, TasksExtrasController, PlantillasTareaController],
  providers: [
    TasksService,
    TasksNotificationsService,
    TasksBulkService,
    TasksContextService,
    TasksAuthorizationService,
    TasksRelationsService,
    // HU-186 (T-329): job diario de recordatorios de vencimiento.
    TasksDueReminderService,
    TasksExtrasService,
    PlantillasTareaService,
    // MEJ-47: job diario de tareas repetitivas.
    TasksRecurrenceService,
    // MEJ-31: resumen "Tu semana" de los lunes.
    WeeklySummaryService,
  ],
  exports: [TasksService, TasksAuthorizationService, TasksContextService],
})
export class TasksModule {}
