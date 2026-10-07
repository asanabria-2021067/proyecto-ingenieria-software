import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CalendarSharesController } from './calendar-shares.controller';
import { CalendarSharesService } from './calendar-shares.service';

/** HU-184: calendarios compartidos (solo lectura) entre usuarios. */
@Module({
  imports: [EventsModule, NotificationsModule],
  controllers: [CalendarSharesController],
  providers: [CalendarSharesService],
})
export class CalendarSharesModule {}
