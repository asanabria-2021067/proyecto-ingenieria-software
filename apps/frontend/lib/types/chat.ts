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
  /** T-234: el proyecto ya cerró — solo lectura, sin mensajes nuevos. */
  archivada: boolean;
}

export interface CreateConversationPayload {
  tipo: 'GRUPAL' | 'INDIVIDUAL';
  nombre?: string;
  idsParticipantes: number[];
}

/** T-236: conversación archivada, cruzando todos los proyectos del usuario
 * (a diferencia de ChatConversacion, que vive dentro de un solo proyecto). */
export interface ArchivedConversacion {
  idConversacion: number;
  tipo: 'GRUPAL' | 'INDIVIDUAL';
  nombre: string | null;
  proyecto: { idProyecto: number; tituloProyecto: string };
  participantes: ChatUsuario[];
  ultimoMensaje: ChatMensaje | null;
  archivada: true;
}

export interface ListArchivedConversationsFiltros {
  q?: string;
  page?: number;
}

export interface ListArchivedConversationsResultado {
  items: ArchivedConversacion[];
  hasMore: boolean;
}
