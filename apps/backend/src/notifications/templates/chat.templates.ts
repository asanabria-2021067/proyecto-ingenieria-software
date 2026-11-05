export interface ChatTemplateData {
  // MEJ-44: mención con @ en un mensaje del chat del proyecto.
  MENCION_CHAT: {
    autorNombre: string;
    tituloProyecto: string;
    idProyecto: number;
    idConversacion: number;
    idMensaje: number;
  };

  // MEJ-131: alguien respondio en el hilo de un mensaje propio.
  RESPUESTA_HILO_CHAT: {
    autorNombre: string;
    tituloProyecto: string;
    idProyecto: number;
    idConversacion: number;
    idMensaje: number;
  };
}

export const CHAT_TEMPLATES = {
  MENCION_CHAT: {
    title: 'Te mencionaron en el chat',
    message: (data: ChatTemplateData['MENCION_CHAT']) =>
      `${data.autorNombre} te mencionó en el chat del proyecto "${data.tituloProyecto}".`,
  },

  RESPUESTA_HILO_CHAT: {
    title: 'Respondieron a tu mensaje',
    message: (data: ChatTemplateData['RESPUESTA_HILO_CHAT']) =>
      `${data.autorNombre} respondió en el hilo de tu mensaje en el chat del proyecto "${data.tituloProyecto}".`,
  },
} as const;
