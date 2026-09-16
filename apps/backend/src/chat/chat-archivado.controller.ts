import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ChatService } from './chat.service';
import { ListArchivedConversationsQueryDto } from './dto/list-archived-conversations-query.dto';

/** T-236: separado de ChatController (`proyectos/:projectId/conversaciones`)
 * porque esta lista cruza TODOS los proyectos del usuario — no tiene un
 * :projectId al que colgarse. */
@Controller('chats')
@UseGuards(JwtAuthGuard)
export class ChatArchivadoController {
  constructor(private chatService: ChatService) {}

  @Get('archivados')
  listArchivados(
    @Query() query: ListArchivedConversationsQueryDto,
    @CurrentUser() user: { userId: number },
  ) {
    return this.chatService.listArchivedConversations(user.userId, query);
  }
}
