import { Module } from '@nestjs/common';
import { EligibilityModule } from '../eligibility/eligibility.module';
import { TimeRecordsModule } from '../time-records/time-records.module';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProjectPolicyModule } from '../common/project-policy/project-policy.module';

@Module({
  imports: [NotificationsModule, ProjectPolicyModule, TimeRecordsModule, EligibilityModule],
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}
