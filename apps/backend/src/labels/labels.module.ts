import { Module } from '@nestjs/common';
import { LabelsController } from './labels.controller';
import { TaskLabelsController } from './task-labels.controller';
import { LabelsService } from './labels.service';
import { ProjectPolicyModule } from '../common/project-policy/project-policy.module';

@Module({
  imports: [ProjectPolicyModule],
  controllers: [LabelsController, TaskLabelsController],
  providers: [LabelsService],
  exports: [LabelsService],
})
export class LabelsModule {}
