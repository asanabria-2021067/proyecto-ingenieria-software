import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationsModule } from '../notifications/notifications.module';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SecurityAlertsService } from './security-alerts.service';
import { SecurityEventsService } from './security-events.service';

/** G05 (OWASP25-C037/C038): writer de eventos de seguridad y alertas de ráfaga, disponible para auth y admin. */
@Global()
@Module({
  imports: [NotificationsModule],
  providers: [
    SecurityEventsService,
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
