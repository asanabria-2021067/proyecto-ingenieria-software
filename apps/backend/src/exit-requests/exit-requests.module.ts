import { Module } from '@nestjs/common';
import { ProjectWriteGuard } from '../common/guards/project-write.guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { SprintsModule } from '../sprints/sprints.module';
import { ExitRequestsAuthorizationService } from './exit-requests.authorization.service';
import { ExitRequestsContextService } from './exit-requests.context.service';
import { ExitRequestsController } from './exit-requests.controller';
import { ExitRequestsService } from './exit-requests.service';

@Module({
  imports: [NotificationsModule, SprintsModule],
  controllers: [ExitRequestsController],
  providers: [
    ExitRequestsService,
    ExitRequestsContextService,
    ExitRequestsAuthorizationService,
    ProjectWriteGuard,
  ],
  exports: [ExitRequestsService],
})
export class ExitRequestsModule {}
