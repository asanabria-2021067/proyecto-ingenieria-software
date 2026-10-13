import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProjectPolicyModule } from '../common/project-policy/project-policy.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SecurityAlertsService } from './security-alerts.service';
import { SecurityEventsController } from './security-events.controller';
import { SecurityEventsQueryService } from './security-events-query.service';
import { SecurityEventsService } from './security-events.service';

/**
 * G05 (OWASP25-C037/C038): writer de eventos de seguridad y alertas de ráfaga, disponible para auth y admin.
 * FG01 (T-310): lector administrativo. Solo el writer se exporta: el lector no sale de este módulo.
 */
@Global()
@Module({
  imports: [NotificationsModule, ProjectPolicyModule],
  controllers: [SecurityEventsController],
  providers: [
    SecurityEventsService,
    SecurityEventsQueryService,
    {
      provide: SecurityAlertsService,
      inject: [PrismaService, NotificationsService, ConfigService],
      useFactory: (prisma: PrismaService, notifications: NotificationsService, config: ConfigService) =>
        new SecurityAlertsService(prisma, notifications, config.get<boolean>('app.securityAlertsEnabled', false)),
    },
  ],
  exports: [SecurityEventsService],
})
export class SecurityEventsModule {}
