export interface ChatUsuario {
  idUsuario: number;
  nombre: string;
  apellido: string;
  fotoUrl: string | null;
}

export interface ChatMensaje {
  idMensaje: number;
  idConversacion: number;
  contenido: string;
  enviadoEn: string;
  remitente: ChatUsuario;
}

export interface ChatConversacion {
  idConversacion: number;
  tipo: 'GRUPAL' | 'INDIVIDUAL';
  nombre: string | null;
  participantes: ChatUsuario[];
  ultimoMensaje: ChatMensaje | null;
  noLeidos: number;
}

export interface CreateConversationPayload {
  tipo: 'GRUPAL' | 'INDIVIDUAL';
  nombre?: string;
  idsParticipantes: number[];
}
