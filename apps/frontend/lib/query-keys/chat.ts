export const projectConversationsQueryKey = (idProyecto: number) =>
  ['proyecto-conversaciones', idProyecto] as const;

export const conversationMessagesQueryKey = (idProyecto: number, idConversacion: number) =>
  ['proyecto-conversaciones', idProyecto, idConversacion, 'mensajes'] as const;

export const conversationReadsQueryKey = (idProyecto: number, idConversacion: number) =>
  ['proyecto-conversaciones', idProyecto, idConversacion, 'lecturas'] as const;

export const conversationLinksQueryKey = (idProyecto: number, idConversacion: number) =>
  ['proyecto-conversaciones', idProyecto, idConversacion, 'enlaces'] as const;

export const archivedConversationsQueryKey = (q: string) =>
  ['chats-archivados', q] as const;

/** Dock global de chat: cruza todos los proyectos del usuario. */
export const allConversationsQueryKey = (q: string = '') =>
  ['chats-global', q] as const;

export const noMolestarQueryKey = ['chat-no-molestar'] as const;
