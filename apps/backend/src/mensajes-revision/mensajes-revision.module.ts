import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProjectPolicyModule } from '../common/project-policy/project-policy.module';
import { MensajesRevisionController } from './mensajes-revision.controller';
import { MensajesRevisionService } from './mensajes-revision.service';

@Module({
  imports: [PrismaModule, NotificationsModule, ProjectPolicyModule],
  controllers: [MensajesRevisionController],
  providers: [MensajesRevisionService],
  exports: [MensajesRevisionService],
})
export class MensajesRevisionModule {}
