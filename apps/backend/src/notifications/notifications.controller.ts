import {
  Body,
  Controller,
  Get,
  Query,
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
import { ListNotificationsQueryDto, NotificationTypesFilterDto } from './dto/list-notifications-query.dto';

@Controller('notificaciones')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get()
  findAll(@CurrentUser() user: { userId: number }, @Query() query: ListNotificationsQueryDto) {
    const filtros = { tipos: query.tipos, leida: query.leida, q: query.q, proyecto: query.proyecto };
    if (query.page !== undefined) {
      return this.notificationsService.findPage(user.userId, query.page, query.limit, filtros, query.orden);
    }
    return this.notificationsService.findAll(user.userId, filtros);
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

  /** HU-198: `?tipos=A,B` acota el marcado a la categoría filtrada; sin él, todas las propias. */
  @Patch('leer-todas')
  markAllAsRead(@CurrentUser() user: { userId: number }, @Query() query: NotificationTypesFilterDto) {
    return this.notificationsService.markAllAsRead(user.userId, query.tipos);
  }

  @Patch(':id/leer')
  markAsRead(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.notificationsService.markAsRead(id, user.userId);
  }
}
