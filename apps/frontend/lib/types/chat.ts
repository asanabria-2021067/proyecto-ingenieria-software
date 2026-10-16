export type TipoEstadoChat = 'EN_CLASE' | 'OCUPADO' | 'DISPONIBLE' | 'PERSONALIZADO';

/** Estado personalizado vigente; `venceEn` null = sin caducidad. */
export interface ChatEstado {
  tipo: TipoEstadoChat;
  texto: string | null;
  venceEn: string | null;
}

export interface SetEstadoChatPayload {
  tipo: TipoEstadoChat;
  texto?: string;
  venceEn?: string | null;
}

export interface ChatUsuario {
  idUsuario: number;
  nombre: string;
  apellido: string;
  fotoUrl: string | null;
  /** Apodo que el usuario autenticado puso a esta persona en la conversacion (privado). */
  apodo?: string | null;
  /** Solo viene en los listados de participantes de conversaciones. */
  estado?: ChatEstado | null;
}

export interface ChatAdjunto {
  idAdjunto: number;
  nombreOriginal: string;
  mime: string;
  tamanoBytes: number;
}

/** Resumen del mensaje citado; `null` si el original ya no existe. */
export interface ChatCita {
  idMensaje: number;
  remitente: ChatUsuario;
  extracto: string;
}

export interface ChatReaccion {
  emoji: string;
  count: number;
  reaccionadoPorMi: boolean;
}

/** Payload del evento `reactionUpdated`: incluye quienes reaccionaron para derivar `reaccionadoPorMi`. */
export interface ChatReaccionSocket {
  emoji: string;
  count: number;
  idsUsuarios: number[];
}

export interface ChatMensaje {
  idMensaje: number;
  idConversacion: number;
  contenido: string;
  enviadoEn: string;
  remitente: ChatUsuario;
  adjunto?: ChatAdjunto | null;
  citado?: ChatCita | null;
  /** Ausente en mensajes recien creados o en `ultimoMensaje`. */
  reacciones?: ChatReaccion[];
  /** Apodo del remitente segun el usuario autenticado, si lo definio. */
  apodoRemitente?: string | null;
  /** Marcador personal del usuario autenticado; ausente en mensajes que llegan por socket. */
  guardado?: boolean;
}

export interface ChatArchivo extends ChatAdjunto {
  idMensaje: number;
  creadoEn: string;
  remitente: ChatUsuario;
}

export interface ChatArchivosPagina {
  items: ChatArchivo[];
  nextCursor: number | null;
}

export interface ChatAdjuntoUrl {
  url: string;
  nombreOriginal: string;
  mime: string;
  expiraEnSegundos: number;
}

/** "Visto por": hasta cuándo leyó la conversación otro participante. */
export interface ChatLectura {
  idUsuario: number;
  ultimaLecturaEn: string | null;
}

export type DuracionSilencio = '1h' | '8h' | 'siempre';

export interface ChatEnlace {
  url: string;
  dominio: string;
  idMensaje: number;
  remitente: ChatUsuario;
  enviadoEn: string;
}

export interface ChatEnlacesPagina {
  items: ChatEnlace[];
  nextCursor: number | null;
}

/** Lista cerrada de temas de color (misma lista que valida el backend). */
export type ChatTemaColor = 'verde' | 'azul' | 'violeta' | 'naranja' | 'rosa' | 'gris';

export interface ChatMensajeProgramado {
  idMensajeProgramado: number;
  idConversacion: number;
  contenido: string;
  enviarEn: string;
  estado: 'PENDIENTE' | 'ENVIADO' | 'CANCELADO' | 'FALLIDO';
  creadoEn: string;
}

export interface ChatConversacion {
  idConversacion: number;
  tipo: 'GRUPAL' | 'INDIVIDUAL';
  nombre: string | null;
  /** Menú de 3 puntos: sobrescribe el nombre mostrado si existe. */
  nombrePersonalizado: string | null;
  /** Canal del proyecto (#general o creado por el líder): `nombre` es el nombre sin #. */
  esCanal: boolean;
  participantes: ChatUsuario[];
  ultimoMensaje: ChatMensaje | null;
  noLeidos: number;
  /** T-234: el proyecto ya cerró — solo lectura, sin mensajes nuevos. */
  archivada: boolean;
  esFavorita: boolean;
  /** Archivado manual desde el menú de 3 puntos (distinto de `archivada`, que es por cierre de proyecto). */
  archivadaManual: boolean;
  silenciada: boolean;
  /** Silencio del usuario actual (distinto del `silenciada` global). */
  silenciadaPorMi: boolean;
  silenciadaHasta: string | null;
  silenciadaSiempre: boolean;
  esPrioritaria: boolean;
  /** Tema elegido por el usuario autenticado; null = color por defecto. */
  temaColor: ChatTemaColor | null;
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
  esCanal: boolean;
  participantes: ChatUsuario[];
  ultimoMensaje: ChatMensaje | null;
  ultimoMensajeEsPropio: boolean;
  noLeidos: number;
  esFavorita: boolean;
  /** Archivado manual desde el menú del dock (proyectos cerrados no aparecen en esta lista). */
  archivadaManual: boolean;
  silenciada: boolean;
  /** Silencio del usuario actual (distinto del `silenciada` global). */
  silenciadaPorMi: boolean;
  silenciadaHasta: string | null;
  silenciadaSiempre: boolean;
  esPrioritaria: boolean;
  /** Tema elegido por el usuario autenticado; null = color por defecto. */
  temaColor: ChatTemaColor | null;
}

/** Modo no molestar del chat: 0 = domingo ... 6 = sabado, horas "HH:mm" en `zona`. */
export interface ConfigNoMolestar {
  activo: boolean;
  horaInicio: string;
  horaFin: string;
  diasSemana: number[];
  zona: string;
}

export interface CreateConversationPayload {
  tipo: 'GRUPAL' | 'INDIVIDUAL';
  nombre?: string;
  idsParticipantes: number[];
}

export interface CreateChannelPayload {
  nombre: string;
  idsMiembros?: number[];
}

export interface ChatCanalCreado {
  idConversacion: number;
  idProyecto: number;
  nombre: string;
  esGeneral: boolean;
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

export interface BuscarMensajesFiltros {
  q?: string;
  idAutor?: number;
  /** ISO 8601 */
  desde?: string;
  /** ISO 8601 */
  hasta?: string;
  pagina?: number;
}

export interface BuscarMensajesResultado {
  items: ChatMensaje[];
  hasMore: boolean;
  pagina: number;
  termino: string | null;
}

/** Mensaje guardado (marcador privado) con los datos mínimos para listarlo y saltar a su conversación. */
export interface MensajeGuardadoItem {
  idMensaje: number;
  contenido: string;
  enviadoEn: string;
  guardadoEn: string;
  remitente: ChatUsuario;
  conversacion: {
    idConversacion: number;
    idProyecto: number;
    tipo: 'GRUPAL' | 'INDIVIDUAL';
    nombre: string | null;
    nombrePersonalizado: string | null;
    participantes: ChatUsuario[];
  };
}

export interface ListSavedMessagesResultado {
  items: MensajeGuardadoItem[];
  hasMore: boolean;
}

/** Vista previa de un link de un mensaje (la arma el backend con proteccion SSRF). */
export interface LinkPreview {
  url: string;
  titulo: string | null;
  descripcion: string | null;
  sitio: string | null;
}
