import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('proyectos/:projectId/conversaciones')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private chatService: ChatService) {}

  @Get()
  findAll(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.chatService.listConversations(projectId, user.userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: CreateConversationDto,
  ) {
    return this.chatService.createConversation(projectId, user.userId, dto);
  }

  @Get(':conversationId/mensajes')
  findMessages(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @Query('cursor') cursor: string | undefined,
    @CurrentUser() user: { userId: number },
  ) {
    const cursorId = cursor && /^\d+$/.test(cursor) ? Number(cursor) : undefined;
    return this.chatService.getMessages(projectId, conversationId, user.userId, cursorId);
  }

  @Post(':conversationId/mensajes')
  @HttpCode(HttpStatus.CREATED)
  sendMessage(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: SendMessageDto,
  ) {
    return this.chatService.createMessage(projectId, conversationId, user.userId, dto.contenido);
  }

  @Post(':conversationId/leido')
  @HttpCode(HttpStatus.OK)
  markRead(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.chatService.markRead(projectId, conversationId, user.userId);
  }
}
