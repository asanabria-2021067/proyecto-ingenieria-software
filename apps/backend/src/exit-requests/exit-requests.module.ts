import { Module } from '@nestjs/common';
import { ProjectPolicyModule } from '../common/project-policy/project-policy.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SprintsModule } from '../sprints/sprints.module';
import { BitacoraModule } from '../bitacora/bitacora.module';
import { ExitRequestsAuthorizationService } from './exit-requests.authorization.service';
import { ExitRequestsContextService } from './exit-requests.context.service';
import { ExitRequestsController } from './exit-requests.controller';
import { ExitRequestsService } from './exit-requests.service';

@Module({
  imports: [ProjectPolicyModule, NotificationsModule, SprintsModule, BitacoraModule],
  controllers: [ExitRequestsController],
  providers: [
    ExitRequestsService,
    ExitRequestsContextService,
    ExitRequestsAuthorizationService,
  ],
  exports: [ExitRequestsService],
})
export class ExitRequestsModule {}
