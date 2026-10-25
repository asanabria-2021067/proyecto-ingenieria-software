import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { MyEventsController } from './my-events.controller';
import { EventsService } from './events.service';
import { EventsReminderService } from './events-reminder.service';
import { AdminMeetingsController } from './admin-meetings.controller';
import { AdminMeetingsService } from './admin-meetings.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [EventsController, MyEventsController, AdminMeetingsController],
  providers: [EventsService, EventsReminderService, AdminMeetingsService],
  exports: [EventsService, AdminMeetingsService],
})
export class EventsModule {}
