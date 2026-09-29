import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { MyEventsController } from './my-events.controller';
import { EventsService } from './events.service';
import { EventsReminderService } from './events-reminder.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [EventsController, MyEventsController],
  providers: [EventsService, EventsReminderService],
  exports: [EventsService],
})
export class EventsModule {}
