import type { Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';

/** Indicadores efímeros del chat (no se persisten). */
export class ChatIndicatorsHandler {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retransmite "escribiendo..." al resto de la room de la conversación. Solo
   * si el emisor participa en ella; el cliente es quien expira el indicador.
   */
  async typing(client: Socket, data: { idConversacion: number }): Promise<{ ok: boolean }> {
    const userId = client.data.userId;
    const idConversacion = data?.idConversacion;
    if (!userId || !Number.isInteger(idConversacion)) return { ok: false };

    const participa = await this.prisma.conversacionParticipante.findUnique({
      where: { idConversacion_idUsuario: { idConversacion, idUsuario: userId } },
      select: { idUsuario: true },
    });
    if (!participa) return { ok: false };

    client.to(`conversation:${idConversacion}`).emit('typing', { idConversacion, idUsuario: userId });
    return { ok: true };
  }
}
