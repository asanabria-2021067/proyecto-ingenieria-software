import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ChatModule } from '../chat/chat.module';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { OrganizationInvitationsService } from './organization-invitations.service';
import { OrganizationChatService } from './organization-chat.service';

@Module({
  imports: [PrismaModule, NotificationsModule, ChatModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, OrganizationInvitationsService, OrganizationChatService],
})
export class OrganizationsModule {}
