import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MensajesRevisionController } from './mensajes-revision.controller';
import { MensajesRevisionService } from './mensajes-revision.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [MensajesRevisionController],
  providers: [MensajesRevisionService],
  exports: [MensajesRevisionService],
})
export class MensajesRevisionModule {}
