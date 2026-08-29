import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';
import { extractCookie, getFrontendUrl } from '../common/utils/cookie';

@WebSocketGateway({
  cors: {
    origin: getFrontendUrl(),
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
      const token =
        client.handshake.auth.token ||
        client.handshake.headers.authorization?.replace('Bearer ', '') ||
        extractCookie(client.handshake.headers.cookie, 'access_token');

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
    } catch {
      this.logger.warn(`Client ${client.id} rejected: invalid token`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    this.logger.log(`Client ${client.id} (user ${userId}) disconnected`);
  }

  async notifyUser(userId: number, notification: unknown) {
    this.server.to(`user:${userId}`).emit('notification', notification);
  }

  async notifyUsers(userIds: number[], notification: unknown) {
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

  /**
   * A9.1: mismo mecanismo exacto que `notifySprintFinalizationStarted`
   * (rooms `user:{idUsuario}`, mismo namespace, sin persistir
   * `Notificacion`) — señal realtime pura para que F6 pueda invalidar y
   * ocultar el banner de bloqueo cuando el Sprint pasa a CERRADO.
   */
  async notifySprintClosed(
    userIds: number[],
    payload: { projectId: number; sprintId: number },
  ) {
    for (const userId of userIds) {
      this.server.to(`user:${userId}`).emit('SPRINT_CLOSED', payload);
    }
  }

  /**
   * HU-142 (T-171): mismo mecanismo de rooms (`user:{idUsuario}`) y mismo
   * patrón de nombre de evento propio que notifySprintFinalizationStarted/
   * notifySprintClosed — señal realtime para que la UI de tarea/equipo
   * invalide sus queries cuando alguien registra horas, sin namespace ni
   * WebSocketServer nuevos.
   */
  async notifyTaskHoursLogged(
    userIds: number[],
    payload: { projectId: number; taskId: number; idAsignacion: number },
  ) {
    for (const userId of userIds) {
      this.server.to(`user:${userId}`).emit('TASK_HOURS_LOGGED', payload);
    }
  }
}
