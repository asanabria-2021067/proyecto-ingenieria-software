import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ChatService } from './chat.service';

/** MEJ-131: hilos. Una respuesta es un mensaje del mismo canal con `idMensajePadre`; no se confunde con la cita. */
@Injectable()
export class ChatHilosService {
  constructor(
    private prisma: PrismaService,
    private chat: ChatService,
    @Optional() private notifications?: NotificationsService,
  ) {}

  /** Respuestas del hilo (las 30 mas recientes o las 30 previas a `cursorId`), solo para participantes. */
  async listar(idProyecto: number, idConversacion: number, idMensaje: number, userId: number, cursorId?: number) {
    await this.chat.assertConversationParticipant(idProyecto, idConversacion, userId);
    return this.chat.mensajesDe(idConversacion, userId, cursorId, idMensaje);
  }

  /** Mismas validaciones, permisos y difusion por socket que un mensaje normal del canal. */
  async responder(idProyecto: number, idConversacion: number, idMensaje: number, userId: number, contenido: string) {
    const respuesta = await this.chat.createMessage(idProyecto, idConversacion, userId, contenido, undefined, undefined, {
      idMensajePadre: idMensaje,
    });
    await this.notificarAutor(idProyecto, idConversacion, idMensaje, userId);
    return respuesta;
  }

  /** Aviso al autor del mensaje original; la preferencia del tipo la aplica NotificationsService. Nunca tumba la respuesta ya guardada. */
  private async notificarAutor(idProyecto: number, idConversacion: number, idMensaje: number, autorId: number) {
    if (!this.notifications) return;
    try {
      const original = await this.prisma.mensajeChat.findUnique({
        where: { idMensaje },
        select: { idRemitente: true },
      });
      if (!original || original.idRemitente === autorId) return;
      const [autor, proyecto] = await Promise.all([
        this.prisma.usuario.findUnique({ where: { idUsuario: autorId }, select: { nombre: true, apellido: true } }),
        this.prisma.proyecto.findUnique({ where: { idProyecto }, select: { tituloProyecto: true } }),
      ]);
      await this.notifications.notifyFromTemplate([original.idRemitente], 'RESPUESTA_HILO_CHAT', {
        autorNombre: autor ? `${autor.nombre} ${autor.apellido}` : 'Un integrante',
        tituloProyecto: proyecto?.tituloProyecto ?? '',
        idProyecto,
        idConversacion,
        idMensaje,
      });
    } catch {
      // best effort
    }
  }
}
