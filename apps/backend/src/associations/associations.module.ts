import { Module } from '@nestjs/common';
import { HorasSemestreModule } from '../horas-semestre/horas-semestre.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminAssociationsController } from './admin-associations.controller';
import { AssociationDashboardController } from './association-dashboard.controller';
import { AssociationDashboardService } from './association-dashboard.service';
import { AssociationsController } from './associations.controller';
import { AssociationsService } from './associations.service';
import { JuntaGuard } from './junta.guard';

@Module({
  imports: [NotificationsModule, HorasSemestreModule],
  controllers: [AdminAssociationsController, AssociationsController, AssociationDashboardController],
  providers: [AssociationsService, AssociationDashboardService, JuntaGuard],
  exports: [AssociationsService, JuntaGuard],
})
export class AssociationsModule {}
