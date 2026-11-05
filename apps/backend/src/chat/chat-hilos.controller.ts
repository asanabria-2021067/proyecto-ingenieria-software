import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ChatHilosService } from './chat-hilos.service';
import { ListHiloQueryDto } from './dto/list-hilo-query.dto';
import { SendRespuestaDto } from './dto/send-respuesta.dto';

/** MEJ-131: hilo de respuestas de un mensaje; el servicio exige ser participante de la conversacion. */
@Controller('proyectos/:projectId/conversaciones/:conversationId/mensajes/:messageId/respuestas')
@UseGuards(JwtAuthGuard)
export class ChatHilosController {
  constructor(private hilos: ChatHilosService) {}

  @Get()
  listar(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @Param('messageId', ParseIntPipe) messageId: number,
    @Query() query: ListHiloQueryDto,
    @CurrentUser() user: { userId: number },
  ) {
    return this.hilos.listar(projectId, conversationId, messageId, user.userId, query.cursor);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  responder(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @Param('messageId', ParseIntPipe) messageId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: SendRespuestaDto,
  ) {
    return this.hilos.responder(projectId, conversationId, messageId, user.userId, dto.contenido);
  }
}
