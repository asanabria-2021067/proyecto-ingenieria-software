import { Module } from '@nestjs/common';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProjectPolicyModule } from '../common/project-policy/project-policy.module';

@Module({
  imports: [NotificationsModule, ProjectPolicyModule],
  controllers: [ApplicationsController],
  providers: [ApplicationsService],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
