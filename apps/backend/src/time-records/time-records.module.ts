import { Module } from '@nestjs/common';
import { ProjectPolicyModule } from '../common/project-policy/project-policy.module';
import { BitacoraModule } from '../bitacora/bitacora.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TimeRecordsController } from './time-records.controller';
import { TimeRecordsService } from './time-records.service';
import { TasksContextService } from '../tasks/tasks-context.service';

@Module({
  // C049 (06 v2 §39): Policy, Bitácora y Notificaciones; este módulo NO
  // depende de Sprints.
  imports: [ProjectPolicyModule, BitacoraModule, NotificationsModule],
  controllers: [TimeRecordsController],
  providers: [TimeRecordsService, TasksContextService],
  exports: [TimeRecordsService],
})
export class TimeRecordsModule {}
