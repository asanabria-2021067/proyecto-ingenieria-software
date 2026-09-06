import { Module } from '@nestjs/common';
import { EligibilityModule } from '../eligibility/eligibility.module';
import { TimeRecordsModule } from '../time-records/time-records.module';
import { TasksController } from './tasks.controller';
import { TareaComentariosController } from './tarea-comentarios.controller';
import { TasksService } from './tasks.service';
import { TasksContextService } from './tasks-context.service';
import { TasksAuthorizationService } from './tasks-authorization.service';
import { TasksRelationsService } from './tasks-relations.service';
import { ComentariosModule } from '../comentarios/comentarios.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SprintsModule } from '../sprints/sprints.module';
import { ProjectPolicyModule } from '../common/project-policy/project-policy.module';
import { BitacoraModule } from '../bitacora/bitacora.module';

@Module({
  imports: [ProjectPolicyModule, ComentariosModule, NotificationsModule, SprintsModule, BitacoraModule, TimeRecordsModule, EligibilityModule],
  controllers: [TasksController, TareaComentariosController],
  providers: [
    TasksService,
    TasksContextService,
    TasksAuthorizationService,
    TasksRelationsService,
  ],
  exports: [TasksService],
})
export class TasksModule {}
