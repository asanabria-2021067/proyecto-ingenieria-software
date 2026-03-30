import { Controller, Get } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Controller('notificaciones')
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get()
  findAll() {
    return this.notificationsService.findAll();
  }
}
