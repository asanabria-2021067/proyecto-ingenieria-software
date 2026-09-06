import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProjectPolicyModule } from '../common/project-policy/project-policy.module';
import { DraftInactivityService } from './draft-inactivity.service';

@Module({
  imports: [ProjectPolicyModule, NotificationsModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, DraftInactivityService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
