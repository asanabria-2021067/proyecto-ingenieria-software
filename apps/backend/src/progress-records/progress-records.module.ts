import { Module } from '@nestjs/common';
import { ProjectWriteGuard } from '../common/guards/project-write.guard';
import { SprintsModule } from '../sprints/sprints.module';
import { ProgressRecordsController } from './progress-records.controller';
import { ProgressRecordsService } from './progress-records.service';
import { TasksContextService } from '../tasks/tasks-context.service';

@Module({
  imports: [SprintsModule],
  controllers: [ProgressRecordsController],
  providers: [ProgressRecordsService, TasksContextService, ProjectWriteGuard],
})
export class ProgressRecordsModule {}
