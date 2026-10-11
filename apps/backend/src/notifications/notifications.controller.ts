import {
  Body,
  Controller,
  Get,
  Patch,
  Param,
  ParseIntPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { UpdatePreferenciaNotificacionDto } from './dto/update-preferencia-notificacion.dto';
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

  @Get('preferencias')
  getPreferences(@CurrentUser() user: { userId: number }) {
    return this.notificationsService.getPreferences(user.userId);
  }

  @Put('preferencias')
  updatePreference(
    @Body() dto: UpdatePreferenciaNotificacionDto,
    @CurrentUser() user: { userId: number },
  ) {
    return this.notificationsService.updatePreference(user.userId, dto.tipo, dto.activa);
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
