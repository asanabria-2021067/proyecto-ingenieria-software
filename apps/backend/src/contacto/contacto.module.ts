import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ContactoController } from './contacto.controller';
import { ContactoService } from './contacto.service';

@Module({
  imports: [NotificationsModule],
  controllers: [ContactoController],
  providers: [ContactoService],
})
export class ContactoModule {}
