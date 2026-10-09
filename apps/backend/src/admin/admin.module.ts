import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { getJwtSecretFromConfig } from '../config/jwt-secret';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    NotificationsModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: getJwtSecretFromConfig(config),
        signOptions: { expiresIn: '24h' },
      }),
    }),
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
