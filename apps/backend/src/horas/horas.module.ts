import { Module } from '@nestjs/common';
import { HorasController } from './horas.controller';
import { HorasService } from './horas.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [HorasController],
  providers: [HorasService],
  exports: [HorasService],
})
export class HorasModule {}
