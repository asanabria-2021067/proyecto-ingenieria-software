import { Module } from '@nestjs/common';
import { ProjectPolicyModule } from '../common/project-policy/project-policy.module';
import { BitacoraModule } from '../bitacora/bitacora.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';

@Module({
  imports: [ProjectPolicyModule, BitacoraModule],
  controllers: [AttendanceController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
