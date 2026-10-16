import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ChatService } from './chat.service';
import { ADJUNTO_MAX_BYTES, type ArchivoSubido } from './chat-adjuntos';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { ListLinksQueryDto } from './dto/list-links-query.dto';
import { SendFileMessageDto } from './dto/send-file-message.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { SilenciarConversationDto } from './dto/silenciar-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

// parts: busboy corta al ALCANZAR el limite, asi que file + contenido = 2 -> 3.
export const CHAT_UPLOAD_LIMITS = { files: 1, fields: 1, parts: 3, fileSize: ADJUNTO_MAX_BYTES };

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

  @Get(':conversationId/enlaces')
  findLinks(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @Query() query: ListLinksQueryDto,
    @CurrentUser() user: { userId: number },
  ) {
    return this.chatService.getLinks(projectId, conversationId, user.userId, query);
  }

  @Post(':conversationId/mensajes')
  @HttpCode(HttpStatus.CREATED)
  sendMessage(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: SendMessageDto,
  ) {
    return this.chatService.createMessage(projectId, conversationId, user.userId, dto.contenido, dto.idMensajeCitado);
  }

  @Get(':conversationId/archivos')
  findFiles(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @Query() query: ListLinksQueryDto,
    @CurrentUser() user: { userId: number },
  ) {
    return this.chatService.getArchivos(projectId, conversationId, user.userId, query);
  }

  @Get(':conversationId/archivos/:attachmentId/url')
  fileUrl(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @Param('attachmentId', ParseIntPipe) attachmentId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.chatService.getAdjuntoUrl(projectId, conversationId, attachmentId, user.userId);
  }

  @Get(':conversationId/archivos/:attachmentId/miniatura')
  async thumbnail(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @Param('attachmentId', ParseIntPipe) attachmentId: number,
    @CurrentUser() user: { userId: number },
  ) {
    const { datos, mime } = await this.chatService.getAdjuntoImagen(projectId, conversationId, attachmentId, user.userId);
    return new StreamableFile(datos, { type: mime, disposition: 'inline' });
  }

  /** Un archivo por mensaje, con o sin texto. El tamano se corta en multer. */
  @Post(':conversationId/mensajes/archivo')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', { limits: CHAT_UPLOAD_LIMITS }))
  sendFileMessage(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: SendFileMessageDto,
    @UploadedFile() file?: ArchivoSubido,
  ) {
    if (!file) throw new BadRequestException('No se recibió el archivo');
    return this.chatService.createMessage(projectId, conversationId, user.userId, dto.contenido ?? '', file);
  }

  @Patch(':conversationId')
  update(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: UpdateConversationDto,
  ) {
    return this.chatService.updateConversation(projectId, conversationId, user.userId, dto);
  }

  @Delete(':conversationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.chatService.deleteConversation(projectId, conversationId, user.userId);
  }

  @Get(':conversationId/lecturas')
  readReceipts(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.chatService.getReadReceipts(projectId, conversationId, user.userId);
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

  @Put(':conversationId/silencio')
  @HttpCode(HttpStatus.NO_CONTENT)
  silenciar(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: SilenciarConversationDto,
  ) {
    return this.chatService.silenciar(projectId, conversationId, user.userId, dto.duracion);
  }

  @Delete(':conversationId/silencio')
  @HttpCode(HttpStatus.NO_CONTENT)
  activarSonido(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.chatService.activarSonido(projectId, conversationId, user.userId);
  }
}
