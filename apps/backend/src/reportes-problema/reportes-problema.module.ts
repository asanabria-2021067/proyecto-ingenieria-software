import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReportesProblemaController } from './reportes-problema.controller';
import { ReportesProblemaService } from './reportes-problema.service';

@Module({
  imports: [NotificationsModule],
  controllers: [ReportesProblemaController],
  providers: [ReportesProblemaService],
})
export class ReportesProblemaModule {}
