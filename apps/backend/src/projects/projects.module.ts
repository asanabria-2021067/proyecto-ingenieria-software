import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { ProjectsCacheService } from './projects-cache.service';
import { ProjectsAffinityService } from './projects-affinity.service';
import { ProjectsRevisionsService } from './projects-revisions.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProjectPolicyModule } from '../common/project-policy/project-policy.module';
import { SocialModule } from '../social/social.module';
import { DraftInactivityService } from './draft-inactivity.service';

@Module({
  imports: [ProjectPolicyModule, NotificationsModule, SocialModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectsCacheService, ProjectsAffinityService, ProjectsRevisionsService, DraftInactivityService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
