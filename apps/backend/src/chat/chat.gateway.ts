import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { getFrontendUrl } from '../common/utils/cookie';
import { WsAuthService } from '../ws-auth/ws-auth.service';
import { ChatRoomsHandler } from './chat-rooms.handler';
import { ChatIndicatorsHandler } from './chat-indicators.handler';
import { ChatBroadcaster } from './chat-broadcaster';
import { ACCOUNT_ACCESS_REVOKED, type AccountAccessRevokedEvent } from '../ws-auth/account-access.events';

@WebSocketGateway({
  cors: {
    origin: getFrontendUrl(),
    credentials: true,
  },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);

  private readonly rooms: ChatRoomsHandler;
  private readonly indicators: ChatIndicatorsHandler;
  private readonly broadcaster = new ChatBroadcaster(() => this.server);

  constructor(
    private readonly wsAuth: WsAuthService,
    prisma: PrismaService,
  ) {
    this.rooms = new ChatRoomsHandler(prisma);
    this.indicators = new ChatIndicatorsHandler(prisma);
  }

  async handleConnection(client: Socket) {
    try {
      // G07 (OWASP25-C025): misma política que notificaciones y HTTP. La
      // autorización por conversación (joinConversation) no cambia.
      const auth = await this.wsAuth.authenticate(client.handshake);
      if (!auth.ok) {
        this.logger.warn(`Client ${client.id} rejected: ${auth.motivo}`);
        client.disconnect();
        return;
      }

      const userId = auth.userId;

      client.data.userId = userId;
      client.join(`user:${userId}`);

      this.logger.log(`Client ${client.id} connected as user ${userId}`);
      client.emit('connected', { userId });
    } catch {
      this.logger.warn(`Client ${client.id} rejected: invalid token`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    this.logger.log(`Client ${client.id} (user ${userId}) disconnected`);
  }

  /** G07 (OWASP25-C025): una cuenta bloqueada o inactivada pierde al instante sus sockets abiertos. */
  @OnEvent(ACCOUNT_ACCESS_REVOKED)
  disconnectAccount({ idUsuario }: AccountAccessRevokedEvent) {
    this.server.in(`user:${idUsuario}`).disconnectSockets(true);
  }

  @SubscribeMessage('joinConversation')
  async joinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { idConversacion: number },
  ): Promise<{ joined: boolean }> {
    return this.rooms.join(client, data);
  }

  @SubscribeMessage('leaveConversation')
  leaveConversation(@ConnectedSocket() client: Socket, @MessageBody() data: { idConversacion: number }) {
    this.rooms.leave(client, data);
  }

  @SubscribeMessage('typing')
  typing(@ConnectedSocket() client: Socket, @MessageBody() data: { idConversacion: number }) {
    return this.indicators.typing(client, data);
  }

  /** Llamado por ChatService tras persistir un mensaje (nunca al revés, para evitar dependencia circular). */
  broadcastMessage(idConversacion: number, destinatarios: number[], mensaje: unknown) {
    this.broadcaster.broadcastMessage(idConversacion, destinatarios, mensaje);
  }

  /** Llamado por ChatService tras marcar una conversación como leída. */
  notifyMessagesRead(idConversacion: number, idUsuario: number, ultimaLecturaEn: Date) {
    this.broadcaster.messagesRead(idConversacion, idUsuario, ultimaLecturaEn);
  }

  /** `reacciones` lleva los ids de quienes reaccionaron: cada cliente deriva su propio "reaccionadoPorMi". */
  broadcastReactionUpdated(
    idConversacion: number,
    idMensaje: number,
    reacciones: { emoji: string; count: number; idsUsuarios: number[] }[],
  ) {
    this.server.to(`conversation:${idConversacion}`).emit('reactionUpdated', { idConversacion, idMensaje, reacciones });
  }

  /** Saca a los usuarios de la room (sockets ya unidos) y les refresca la lista de chats. */
  removeFromConversation(idConversacion: number, usuarios: number[]) {
    for (const idUsuario of usuarios) {
      this.server.in(`user:${idUsuario}`).socketsLeave(`conversation:${idConversacion}`);
      this.server.to(`user:${idUsuario}`).emit('conversationUpdated', { idConversacion });
    }
  }

  /** Llamado por ChatService tras crear una conversación nueva. */
  notifyConversationCreated(idConversacion: number, destinatarios: number[]) {
    this.broadcaster.notifyConversationCreated(idConversacion, destinatarios);
  }
}
