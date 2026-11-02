import { Module } from '@nestjs/common';
import { HorasSemestreController } from './horas-semestre.controller';
import { AdminHorasSemestreController } from './admin-horas-semestre.controller';
import { HorasSemestreService } from './horas-semestre.service';
import { HorasAvisosService } from './horas-avisos.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [HorasSemestreController, AdminHorasSemestreController],
  providers: [HorasSemestreService, HorasAvisosService],
  exports: [HorasSemestreService],
})
export class HorasSemestreModule {}
