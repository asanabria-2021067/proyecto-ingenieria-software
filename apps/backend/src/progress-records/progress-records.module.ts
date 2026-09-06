import { Module } from '@nestjs/common';
import { ProjectPolicyModule } from '../common/project-policy/project-policy.module';
import { SprintsModule } from '../sprints/sprints.module';
import { ProgressRecordsController } from './progress-records.controller';
import { ProgressRecordsService } from './progress-records.service';
import { TasksContextService } from '../tasks/tasks-context.service';

@Module({
  imports: [ProjectPolicyModule, SprintsModule],
  controllers: [ProgressRecordsController],
  providers: [ProgressRecordsService, TasksContextService],
})
export class ProgressRecordsModule {}
