import { Module } from '@nestjs/common';
import { ApplicationsModule } from '../applications/applications.module';
import { ExitRequestsModule } from '../exit-requests/exit-requests.module';
import { ProjectPolicyModule } from '../common/project-policy/project-policy.module';
import { ChatModule } from '../chat/chat.module';
import { BitacoraModule } from '../bitacora/bitacora.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TimeRecordsModule } from '../time-records/time-records.module';
import { TeamController } from './team.controller';
import { TeamGestionService } from './team-gestion.service';
import { TeamService } from './team.service';

@Module({
  imports: [ApplicationsModule, ExitRequestsModule, ProjectPolicyModule, BitacoraModule, NotificationsModule, TimeRecordsModule, ChatModule],
  controllers: [TeamController],
  providers: [TeamService, TeamGestionService],
  exports: [TeamService],
})
export class TeamModule {}
