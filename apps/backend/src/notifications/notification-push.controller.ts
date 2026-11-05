import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BajaPushDto, SuscripcionPushDto } from './dto/suscripcion-push.dto';
import { UpdateSilencioDto } from './dto/update-silencio.dto';
import { NotificationSilencioService } from './notification-silencio.service';
import { PushService } from './push.service';

/** MEJ-136/137: horario de silencio y suscripciones push del propio usuario. */
@Controller('notificaciones')
@UseGuards(JwtAuthGuard)
export class NotificationPushController {
  constructor(
    private silencio: NotificationSilencioService,
    private push: PushService,
  ) {}

  @Get('silencio')
  getSilencio(@CurrentUser() user: { userId: number }) {
    return this.silencio.obtener(user.userId);
  }

  @Put('silencio')
  updateSilencio(@CurrentUser() user: { userId: number }, @Body() dto: UpdateSilencioDto) {
    return this.silencio.guardar(user.userId, dto);
  }

  @Get('push/clave')
  clavePublica() {
    return this.push.clavePublica();
  }

  @Post('push/suscripciones')
  @HttpCode(HttpStatus.CREATED)
  suscribir(@CurrentUser() user: { userId: number }, @Body() dto: SuscripcionPushDto) {
    return this.push.suscribir(user.userId, dto);
  }

  @Delete('push/suscripciones')
  @HttpCode(HttpStatus.NO_CONTENT)
  cancelar(@CurrentUser() user: { userId: number }, @Query() query: BajaPushDto) {
    return this.push.cancelar(user.userId, query.endpoint);
  }
}
