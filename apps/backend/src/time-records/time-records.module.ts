import { Module } from '@nestjs/common';
import { ProjectWriteGuard } from '../common/guards/project-write.guard';
import { SprintsModule } from '../sprints/sprints.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TimeRecordsController } from './time-records.controller';
import { TimeRecordsService } from './time-records.service';
import { TasksContextService } from '../tasks/tasks-context.service';

@Module({
  imports: [SprintsModule, NotificationsModule],
  controllers: [TimeRecordsController],
  providers: [TimeRecordsService, TasksContextService, ProjectWriteGuard],
})
export class TimeRecordsModule {}
