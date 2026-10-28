import type { Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { puedeEntrarAConversacion } from './chat-acceso';

/** Rooms por conversación: el cliente solo entra si participa en ella. */
export class ChatRoomsHandler {
  constructor(private readonly prisma: PrismaService) {}

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
  async join(client: Socket, data: { idConversacion: number }): Promise<{ joined: boolean }> {
    const userId = client.data.userId;
    if (!userId || !data?.idConversacion) return { joined: false };

    if (!(await puedeEntrarAConversacion(this.prisma, data.idConversacion, userId))) return { joined: false };

    client.join(`conversation:${data.idConversacion}`);
    return { joined: true };
  }

  leave(client: Socket, data: { idConversacion: number }) {
    if (!data?.idConversacion) return;
    client.leave(`conversation:${data.idConversacion}`);
  }
}
