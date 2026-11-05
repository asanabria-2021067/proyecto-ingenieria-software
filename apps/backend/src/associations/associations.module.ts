import { Module } from '@nestjs/common';
import { HorasSemestreModule } from '../horas-semestre/horas-semestre.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminAssociationsController } from './admin-associations.controller';
import { AssociationDashboardController } from './association-dashboard.controller';
import { AssociationDashboardService } from './association-dashboard.service';
import { AsociacionMetasAvisosController } from './asociacion-metas-avisos.controller';
import { AssociationsController } from './associations.controller';
import { AssociationsService } from './associations.service';
import { AvisosAsociacionService } from './avisos-asociacion.service';
import { JuntaGuard } from './junta.guard';
import { MetasAsociacionService } from './metas-asociacion.service';

@Module({
  imports: [NotificationsModule, HorasSemestreModule],
  controllers: [AdminAssociationsController, AssociationsController, AssociationDashboardController, AsociacionMetasAvisosController],
  providers: [AssociationsService, AssociationDashboardService, JuntaGuard, MetasAsociacionService, AvisosAsociacionService],
  exports: [AssociationsService, JuntaGuard],
})
export class AssociationsModule {}
