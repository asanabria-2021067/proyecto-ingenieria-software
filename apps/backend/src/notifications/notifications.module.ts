import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';
import { ApplicationNotificationListener } from './listeners/application-notification.listener';
import { PrismaModule } from '../prisma/prisma.module';
import { requireJwtSecret } from '../config/jwt-secret';

@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: requireJwtSecret(config.get<string>('JWT_SECRET')),
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsGateway,
    ApplicationNotificationListener,
  ],
  exports: [NotificationsService, NotificationsGateway],
})
export class NotificationsModule {}
