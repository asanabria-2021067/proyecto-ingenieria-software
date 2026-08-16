import { Module } from '@nestjs/common';
import { ProgressRecordsController } from './progress-records.controller';
import { ProgressRecordsService } from './progress-records.service';
import { TasksContextService } from '../tasks/tasks-context.service';

@Module({
  controllers: [ProgressRecordsController],
  providers: [ProgressRecordsService, TasksContextService],
})
export class ProgressRecordsModule {}
