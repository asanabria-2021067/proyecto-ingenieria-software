import { Module } from '@nestjs/common';
import { ProjectPolicyModule } from '../common/project-policy/project-policy.module';
import { SprintsModule } from '../sprints/sprints.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TimeRecordsController } from './time-records.controller';
import { TimeRecordsService } from './time-records.service';
import { TasksContextService } from '../tasks/tasks-context.service';

@Module({
  imports: [ProjectPolicyModule, SprintsModule, NotificationsModule],
  controllers: [TimeRecordsController],
  providers: [TimeRecordsService, TasksContextService],
})
export class TimeRecordsModule {}
