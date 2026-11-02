import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { EventsModule } from '../events/events.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProjectPolicyModule } from '../common/project-policy/project-policy.module';
import { RoleInvitationsController } from './role-invitations.controller';
import { RoleInvitationsService } from './role-invitations.service';

@Module({
  imports: [NotificationsModule, ProjectPolicyModule, ChatModule, EventsModule],
  controllers: [RoleInvitationsController],
  providers: [RoleInvitationsService],
})
export class RoleInvitationsModule {}
