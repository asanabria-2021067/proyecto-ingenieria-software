import { Module } from '@nestjs/common';
import { RevisionesService } from './revisiones.service';
import { RevisionesController } from './revisiones.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProjectPolicyModule } from '../common/project-policy/project-policy.module';

@Module({
  imports: [PrismaModule, NotificationsModule, ProjectPolicyModule],
  controllers: [RevisionesController],
  providers: [RevisionesService],
  exports: [RevisionesService],
})
export class RevisionesModule {}
