import { Module } from '@nestjs/common';
import { ProjectPolicyModule } from '../common/project-policy/project-policy.module';
import { TasksModule } from '../tasks/tasks.module';
import { EvidenceController } from './evidence.controller';
import { EvidenceService } from './evidence.service';

@Module({
  imports: [ProjectPolicyModule, TasksModule],
  controllers: [EvidenceController],
  providers: [EvidenceService],
})
export class EvidenceModule {}
