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
import { PrismaService } from '../prisma/prisma.service';
import { getFrontendUrl } from '../common/utils/cookie';
import { WsAuthService } from '../ws-auth/ws-auth.service';

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

  constructor(
    private readonly wsAuth: WsAuthService,
    private prisma: PrismaService,
  ) {}

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

  /**
   * El cliente se une a la room de una conversación solo si de verdad
   * participa en ella (fila en ConversacionParticipante) — sin esta
   * comprobación, cualquier socket autenticado podría unirse a la room de
   * una conversación ajena y recibir sus mensajes.
   *
   * Devuelve `{ joined }` como ack: sin esto, un join fallido (p. ej. una
   * consulta a la BD que tarda o falla) es indistinguible en el cliente de
   * uno exitoso, y el cliente se queda creyendo que recibirá mensajes en
   * vivo cuando en realidad nunca se unió a la room.
   */
  @SubscribeMessage('joinConversation')
  async joinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { idConversacion: number },
  ): Promise<{ joined: boolean }> {
    const userId = client.data.userId;
    if (!userId || !data?.idConversacion) return { joined: false };

    const participa = await this.prisma.conversacionParticipante.findUnique({
      where: { idConversacion_idUsuario: { idConversacion: data.idConversacion, idUsuario: userId } },
      select: { idUsuario: true },
    });
    if (!participa) return { joined: false };

    client.join(`conversation:${data.idConversacion}`);
    return { joined: true };
  }

  @SubscribeMessage('leaveConversation')
  leaveConversation(@ConnectedSocket() client: Socket, @MessageBody() data: { idConversacion: number }) {
    if (!data?.idConversacion) return;
    client.leave(`conversation:${data.idConversacion}`);
  }

  /** Llamado por ChatService tras persistir un mensaje (nunca al revés, para evitar dependencia circular). */
  broadcastMessage(idConversacion: number, destinatarios: number[], mensaje: unknown) {
    this.server.to(`conversation:${idConversacion}`).emit('newMessage', { idConversacion, mensaje });
    for (const idUsuario of destinatarios) {
      this.server.to(`user:${idUsuario}`).emit('conversationUpdated', { idConversacion });
    }
  }

  /**
   * Llamado por ChatService tras crear una conversación nueva: sin esto, el
   * resto de participantes no se enteran de que existe hasta recargar la
   * página (su lista de conversaciones ya se cargó antes de que se creara).
   * Reutiliza el mismo evento `conversationUpdated` que ya escucha el
   * cliente para refrescar la lista — no hace falta un evento nuevo.
   */
  notifyConversationCreated(idConversacion: number, destinatarios: number[]) {
    for (const idUsuario of destinatarios) {
      this.server.to(`user:${idUsuario}`).emit('conversationUpdated', { idConversacion });
    }
  }
}
