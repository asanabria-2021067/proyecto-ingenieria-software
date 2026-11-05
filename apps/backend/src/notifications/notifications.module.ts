import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { NotificationsController } from './notifications.controller';
import { NotificationPushController } from './notification-push.controller';
import { NotificationSilencioService } from './notification-silencio.service';
import { PushService } from './push.service';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';
import { ApplicationNotificationListener } from './listeners/application-notification.listener';
import { PrismaModule } from '../prisma/prisma.module';
import { getJwtSecretFromConfig } from '../config/jwt-secret';
import { WsAuthService } from '../ws-auth/ws-auth.service';

@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: getJwtSecretFromConfig(config),
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  controllers: [NotificationsController, NotificationPushController],
  providers: [
    NotificationsService,
    NotificationsGateway,
    NotificationSilencioService,
    PushService,
    ApplicationNotificationListener,
    // G07 (OWASP25-C025): política del handshake con el JwtService de este módulo.
    WsAuthService,
  ],
  exports: [NotificationsService, NotificationsGateway],
})
export class NotificationsModule {}
