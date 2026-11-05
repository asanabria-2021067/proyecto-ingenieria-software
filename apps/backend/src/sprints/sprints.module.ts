import { Module } from '@nestjs/common';
import { SprintsController } from './sprints.controller';
import { SprintsContextService } from './sprints-context.service';
import { SprintsAuthorizationService } from './sprints-authorization.service';
import { SprintsService } from './sprints.service';
import { EjemploProyectoController } from './ejemplo-proyecto.controller';
import { EjemploProyectoService } from './ejemplo-proyecto.service';
import { SprintObjetivoService } from './sprint-objetivo.service';
import { SprintColumnTimeService } from './sprint-column-time.service';
import { SprintsReadService } from './sprints-read.service';
import { HoursRecognitionService } from './hours-recognition.service';
import { ProjectHoursSummaryService } from './project-hours-summary.service';
import { SprintSnapshotsService } from './sprint-snapshots.service';
import { AdminSprintsController } from './admin-sprints.controller';
import { AdminSprintsCalendarService } from './admin-sprints-calendar.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { BitacoraModule } from '../bitacora/bitacora.module';
import { ProjectPolicyModule } from '../common/project-policy/project-policy.module';

@Module({
  imports: [NotificationsModule, BitacoraModule, ProjectPolicyModule],
  controllers: [SprintsController, AdminSprintsController, EjemploProyectoController],
  providers: [
    SprintsContextService,
    SprintsAuthorizationService,
    SprintsService,
    EjemploProyectoService,
    SprintObjetivoService,
    SprintColumnTimeService,
    SprintsReadService,
    HoursRecognitionService,
    ProjectHoursSummaryService,
    SprintSnapshotsService,
    AdminSprintsCalendarService,
  ],
  exports: [
    SprintsContextService,
    SprintsAuthorizationService,
    SprintsService,
    HoursRecognitionService,
    ProjectHoursSummaryService,
    SprintSnapshotsService,
  ],
})
export class SprintsModule {}
