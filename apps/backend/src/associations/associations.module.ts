import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminAssociationsController } from './admin-associations.controller';
import { AssociationsController } from './associations.controller';
import { AssociationsService } from './associations.service';
import { JuntaGuard } from './junta.guard';

@Module({
  imports: [NotificationsModule],
  controllers: [AdminAssociationsController, AssociationsController],
  providers: [AssociationsService, JuntaGuard],
  exports: [AssociationsService, JuntaGuard],
})
export class AssociationsModule {}
