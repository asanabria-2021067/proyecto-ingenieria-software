import { Module } from '@nestjs/common';
import { SprintsController } from './sprints.controller';
import { SprintsContextService } from './sprints-context.service';
import { SprintsAuthorizationService } from './sprints-authorization.service';
import { SprintsService } from './sprints.service';
import { HoursRecognitionService } from './hours-recognition.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { BitacoraModule } from '../bitacora/bitacora.module';

@Module({
  imports: [NotificationsModule, BitacoraModule],
  controllers: [SprintsController],
  providers: [
    SprintsContextService,
    SprintsAuthorizationService,
    SprintsService,
    HoursRecognitionService,
  ],
  exports: [
    SprintsContextService,
    SprintsAuthorizationService,
    SprintsService,
    HoursRecognitionService,
  ],
})
export class SprintsModule {}
