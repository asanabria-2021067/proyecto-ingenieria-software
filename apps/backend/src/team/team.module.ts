import { Module } from '@nestjs/common';
import { ApplicationsModule } from '../applications/applications.module';
import { ExitRequestsModule } from '../exit-requests/exit-requests.module';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';

@Module({
  imports: [ApplicationsModule, ExitRequestsModule],
  controllers: [TeamController],
  providers: [TeamService],
  exports: [TeamService],
})
export class TeamModule {}
