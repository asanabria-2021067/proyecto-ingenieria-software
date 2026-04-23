import {
  Controller,
  Get,
  Patch,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('notificaciones')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get()
  findAll(@CurrentUser() user: { userId: number }) {
    return this.notificationsService.findAll(user.userId);
  }

  @Get('mias/no-leidas')
  findUnreadForUser(@CurrentUser() user: { userId: number }) {
    return this.notificationsService.findUnreadForUser(user.userId);
  }

  @Get('mias/conteo-no-leidas')
  getUnreadCount(@CurrentUser() user: { userId: number }) {
    return this.notificationsService.getUnreadCount(user.userId);
  }

  @Patch('leer-todas')
  markAllAsRead(@CurrentUser() user: { userId: number }) {
    return this.notificationsService.markAllAsRead(user.userId);
  }

  @Patch(':id/leer')
  markAsRead(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.notificationsService.markAsRead(id, user.userId);
  }
}
