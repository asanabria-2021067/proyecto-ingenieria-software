import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { InsigniasController } from './insignias.controller';
import { InsigniasListener } from './insignias.listener';
import { InsigniasService } from './insignias.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [InsigniasController],
  providers: [InsigniasService, InsigniasListener],
  exports: [InsigniasService],
})
export class InsigniasModule {}
