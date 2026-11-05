import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { BienvenidaController } from './bienvenida.controller';
import { BienvenidaService } from './bienvenida.service';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProjectPolicyModule } from '../common/project-policy/project-policy.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [NotificationsModule, ProjectPolicyModule, ChatModule, EventsModule],
  controllers: [ApplicationsController, BienvenidaController],
  providers: [ApplicationsService, BienvenidaService],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
