import { Module } from '@nestjs/common';
import { RevisionesService } from './revisiones.service';
import { RevisionesController } from './revisiones.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [RevisionesController],
  providers: [RevisionesService],
  exports: [RevisionesService],
})
export class RevisionesModule {}
