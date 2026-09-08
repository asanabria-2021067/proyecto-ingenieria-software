import { Module } from '@nestjs/common';
import { ApplicationsModule } from '../applications/applications.module';
import { ExitRequestsModule } from '../exit-requests/exit-requests.module';
import { ProjectPolicyModule } from '../common/project-policy/project-policy.module';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';

@Module({
  imports: [ApplicationsModule, ExitRequestsModule, ProjectPolicyModule],
  controllers: [TeamController],
  providers: [TeamService],
  exports: [TeamService],
})
export class TeamModule {}
