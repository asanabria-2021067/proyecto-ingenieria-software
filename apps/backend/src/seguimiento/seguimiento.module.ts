import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { BitacoraModule } from '../bitacora/bitacora.module';
import { SprintsModule } from '../sprints/sprints.module';
import { ProjectPolicyModule } from '../common/project-policy/project-policy.module';
import { SeguimientoController } from './seguimiento.controller';
import { SeguimientoService } from './seguimiento.service';
import { ReconocimientosService } from './reconocimientos.service';
import { RetrospectivaService } from './retrospectiva.service';
import { SprintReportService } from './sprint-report.service';
import { HitosAtrasadosService } from './hitos-atrasados.service';

/** MEJ-54/55/56/57/23/24: seguimiento del proyecto, reconocimientos, retrospectiva y reporte del Sprint. */
@Module({
  imports: [NotificationsModule, BitacoraModule, SprintsModule, ProjectPolicyModule],
  controllers: [SeguimientoController],
  providers: [
    SeguimientoService,
    ReconocimientosService,
    RetrospectivaService,
    SprintReportService,
    HitosAtrasadosService,
  ],
})
export class SeguimientoModule {}
