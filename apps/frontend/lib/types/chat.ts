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
  /** Menú de 3 puntos: sobrescribe el nombre mostrado si existe. */
  nombrePersonalizado: string | null;
  participantes: ChatUsuario[];
  ultimoMensaje: ChatMensaje | null;
  noLeidos: number;
  /** T-234: el proyecto ya cerró — solo lectura, sin mensajes nuevos. */
  archivada: boolean;
  esFavorita: boolean;
  /** Archivado manual desde el menú de 3 puntos (distinto de `archivada`, que es por cierre de proyecto). */
  archivadaManual: boolean;
  silenciada: boolean;
  esPrioritaria: boolean;
}

/** Dock global de chat: cruza todos los proyectos del usuario (a diferencia
 * de ChatConversacion, que vive dentro de un solo proyecto). */
export interface ChatConversacionGlobal {
  idConversacion: number;
  idProyecto: number;
  proyecto: { idProyecto: number; tituloProyecto: string };
  tipo: 'GRUPAL' | 'INDIVIDUAL';
  nombre: string | null;
  nombrePersonalizado: string | null;
  participantes: ChatUsuario[];
  ultimoMensaje: ChatMensaje | null;
  ultimoMensajeEsPropio: boolean;
  noLeidos: number;
  esFavorita: boolean;
  /** Archivado manual desde el menú del dock (proyectos cerrados no aparecen en esta lista). */
  archivadaManual: boolean;
  silenciada: boolean;
  esPrioritaria: boolean;
}

export interface CreateConversationPayload {
  tipo: 'GRUPAL' | 'INDIVIDUAL';
  nombre?: string;
  idsParticipantes: number[];
}

/** Menú de 3 puntos: cada acción manda un único campo a la vez. */
export interface UpdateConversationPayload {
  archivada?: boolean;
  esFavorita?: boolean;
  silenciada?: boolean;
  esPrioritaria?: boolean;
  nombrePersonalizado?: string | null;
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
