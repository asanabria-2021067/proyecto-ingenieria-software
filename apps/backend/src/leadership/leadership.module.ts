import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProjectPolicyModule } from '../common/project-policy/project-policy.module';
import { EligibilityModule } from '../eligibility/eligibility.module';
import { BitacoraModule } from '../bitacora/bitacora.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LeadershipAdminController } from './leadership-admin.controller';
import { LeadershipController } from './leadership.controller';
import { LeadershipReadService } from './leadership-read.service';
import { LeadershipService } from './leadership.service';

/**
 * C091 (06 v2 §38/§39): módulo de liderazgo. Importa Policy, Eligibility,
 * Bitacora y Notifications, y exporta únicamente `LeadershipReadService`,
 * porque las lecturas de liderazgo son lo que otros módulos necesitan
 * componer; la escritura se hace por sus rutas, nunca desde fuera.
 *
 * NO se registra todavía en `AppModule`: en C091 la superficie es cero.
 */
@Module({
  imports: [PrismaModule, ProjectPolicyModule, EligibilityModule, BitacoraModule, NotificationsModule],
  controllers: [LeadershipController, LeadershipAdminController],
  providers: [LeadershipService, LeadershipReadService],
  exports: [LeadershipReadService],
})
export class LeadershipModule {}
