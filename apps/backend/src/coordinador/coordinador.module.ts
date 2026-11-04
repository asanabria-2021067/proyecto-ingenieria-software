import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminCoordinadoresController, CoordinadorController } from './coordinador.controller';
import { CoordinadorService } from './coordinador.service';

@Module({
  imports: [NotificationsModule],
  controllers: [AdminCoordinadoresController, CoordinadorController],
  providers: [CoordinadorService],
})
export class CoordinadorModule {}
