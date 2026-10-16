import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ChatEstadoService } from './chat-estado.service';
import { SetEstadoChatDto } from './dto/set-estado-chat.dto';

/** Estado personalizado del propio usuario; el de otros solo viaja dentro de sus conversaciones compartidas. */
@Controller('chats/estado')
@UseGuards(JwtAuthGuard)
export class ChatEstadoController {
  constructor(private estadoService: ChatEstadoService) {}

  @Get()
  obtener(@CurrentUser() user: { userId: number }) {
    return this.estadoService.obtener(user.userId);
  }

  @Put()
  definir(@CurrentUser() user: { userId: number }, @Body() dto: SetEstadoChatDto) {
    return this.estadoService.definir(user.userId, dto);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  limpiar(@CurrentUser() user: { userId: number }) {
    return this.estadoService.limpiar(user.userId);
  }
}
