import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ChatService } from './chat.service';
import { ListArchivedConversationsQueryDto } from './dto/list-archived-conversations-query.dto';
import { UpdateNoMolestarDto } from './dto/update-no-molestar.dto';

/** T-236: separado de ChatController (`proyectos/:projectId/conversaciones`)
 * porque esta lista cruza TODOS los proyectos del usuario — no tiene un
 * :projectId al que colgarse. */
@Controller('chats')
@UseGuards(JwtAuthGuard)
export class ChatArchivadoController {
  constructor(private chatService: ChatService) {}

  /** Dock global de chat: todas las conversaciones activas del usuario, de cualquier proyecto. */
  @Get()
  listTodas(
    @Query('q') q: string | undefined,
    @CurrentUser() user: { userId: number },
  ) {
    return this.chatService.listAllConversations(user.userId, q);
  }

  @Get('archivados')
  listArchivados(
    @Query() query: ListArchivedConversationsQueryDto,
    @CurrentUser() user: { userId: number },
  ) {
    return this.chatService.listArchivedConversations(user.userId, query);
  }

  @Get('no-molestar')
  getNoMolestar(@CurrentUser() user: { userId: number }) {
    return this.chatService.getNoMolestar(user.userId);
  }

  @Put('no-molestar')
  updateNoMolestar(@Body() dto: UpdateNoMolestarDto, @CurrentUser() user: { userId: number }) {
    return this.chatService.updateNoMolestar(user.userId, dto);
  }
}
