import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { DraftInactivityService } from './draft-inactivity.service';

@Module({
  imports: [NotificationsModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, DraftInactivityService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
