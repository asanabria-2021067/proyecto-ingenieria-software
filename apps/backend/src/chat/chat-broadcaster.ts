import type { Server } from 'socket.io';

/** Emisiones del servidor hacia las rooms `conversation:{id}` y `user:{id}`. */
export class ChatBroadcaster {
  constructor(private readonly getServer: () => Server) {}

  broadcastMessage(idConversacion: number, destinatarios: number[], mensaje: unknown) {
    const server = this.getServer();
    server.to(`conversation:${idConversacion}`).emit('newMessage', { idConversacion, mensaje });
    for (const idUsuario of destinatarios) {
      server.to(`user:${idUsuario}`).emit('conversationUpdated', { idConversacion });
    }
  }

  /** Avisa a la room que `idUsuario` leyó la conversación hasta `ultimaLecturaEn`. */
  messagesRead(idConversacion: number, idUsuario: number, ultimaLecturaEn: Date) {
    this.getServer().to(`conversation:${idConversacion}`).emit('messagesRead', { idConversacion, idUsuario, ultimaLecturaEn });
  }

  /**
   * Sin esto, el resto de participantes no se enteran de que una conversación
   * nueva existe hasta recargar. Reutiliza `conversationUpdated`.
   */
  notifyConversationCreated(idConversacion: number, destinatarios: number[]) {
    const server = this.getServer();
    for (const idUsuario of destinatarios) {
      server.to(`user:${idUsuario}`).emit('conversationUpdated', { idConversacion });
    }
  }
}
