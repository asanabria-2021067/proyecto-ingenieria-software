import { Body, Controller, HttpCode, HttpStatus, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ChatTarjetasService } from './chat-tarjetas.service';
import { RecordatoriosMensajeService } from './recordatorios-mensaje.service';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { ResolveCardsDto } from './dto/resolve-cards.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

/** MEJ-45 (tarjetas de enlaces internos) y MEJ-46 («Recuérdamelo»). */
@Controller('proyectos/:projectId/conversaciones/:conversationId')
@UseGuards(JwtAuthGuard)
export class ChatMensajesExtrasController {
  constructor(
    private tarjetas: ChatTarjetasService,
    private recordatorios: RecordatoriosMensajeService,
  ) {}

  @Post('tarjetas')
  @HttpCode(HttpStatus.OK)
  resolveCards(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: ResolveCardsDto,
  ) {
    return this.tarjetas.resolver(projectId, conversationId, user.userId, dto.rutas);
  }

  @Post('mensajes/:messageId/recordatorio')
  @HttpCode(HttpStatus.CREATED)
  createReminder(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @Param('messageId', ParseIntPipe) messageId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: CreateReminderDto,
  ) {
    return this.recordatorios.crear(projectId, conversationId, messageId, user.userId, new Date(dto.recordarEn));
  }
}
