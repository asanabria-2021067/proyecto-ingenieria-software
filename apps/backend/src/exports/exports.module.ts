import { Module } from '@nestjs/common';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';
import { ProjectPolicyModule } from '../common/project-policy/project-policy.module';
import { TeamModule } from '../team/team.module';
import { SprintsModule } from '../sprints/sprints.module';
import { BitacoraModule } from '../bitacora/bitacora.module';

@Module({
  imports: [ProjectPolicyModule, TeamModule, SprintsModule, BitacoraModule],
  controllers: [ExportsController],
  providers: [ExportsService],
})
export class ExportsModule {}
