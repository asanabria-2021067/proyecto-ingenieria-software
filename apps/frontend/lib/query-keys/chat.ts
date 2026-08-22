export const projectConversationsQueryKey = (idProyecto: number) =>
  ['proyecto-conversaciones', idProyecto] as const;

export const conversationMessagesQueryKey = (idProyecto: number, idConversacion: number) =>
  ['proyecto-conversaciones', idProyecto, idConversacion, 'mensajes'] as const;
