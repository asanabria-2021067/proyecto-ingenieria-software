import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ExitRequestsAuthorizationService } from './exit-requests.authorization.service';
import { ExitRequestsContextService } from './exit-requests.context.service';
import { ExitRequestsController } from './exit-requests.controller';
import { ExitRequestsService } from './exit-requests.service';

@Module({
  imports: [NotificationsModule],
  controllers: [ExitRequestsController],
  providers: [ExitRequestsService, ExitRequestsContextService, ExitRequestsAuthorizationService],
})
export class ExitRequestsModule {}
