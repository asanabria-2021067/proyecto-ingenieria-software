import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/notifications',
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(private jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth.token || client.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`Client ${client.id} rejected: no token`);
        client.disconnect();
        return;
      }

      const payload = await this.jwtService.verifyAsync(token);
      const userId = payload.sub;

      client.data.userId = userId;
      client.join(`user:${userId}`);

      this.logger.log(`Client ${client.id} connected as user ${userId}`);
      client.emit('connected', { userId });
    } catch (error) {
      this.logger.warn(`Client ${client.id} rejected: invalid token`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    this.logger.log(`Client ${client.id} (user ${userId}) disconnected`);
  }

  async notifyUser(userId: number, notification: any) {
    this.server.to(`user:${userId}`).emit('notification', notification);
  }

  async notifyUsers(userIds: number[], notification: any) {
    for (const userId of userIds) {
      this.server.to(`user:${userId}`).emit('notification', notification);
    }
  }

  /**
   * A4: mismo mecanismo de rooms (`user:{idUsuario}`) que notifyUsers, pero
   * con un nombre de evento propio (`SPRINT_FINALIZATION_STARTED`) en vez
   * del genérico `notification` — señal realtime específica de Sprint 6,
   * sin namespace/gateway/WebSocketServer nuevos.
   */
  async notifySprintFinalizationStarted(
    userIds: number[],
    payload: { projectId: number; sprintId: number },
  ) {
    for (const userId of userIds) {
      this.server.to(`user:${userId}`).emit('SPRINT_FINALIZATION_STARTED', payload);
    }
  }
}
