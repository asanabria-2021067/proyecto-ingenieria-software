export const projectConversationsQueryKey = (idProyecto: number) =>
  ['proyecto-conversaciones', idProyecto] as const;

export const conversationMessagesQueryKey = (idProyecto: number, idConversacion: number) =>
  ['proyecto-conversaciones', idProyecto, idConversacion, 'mensajes'] as const;

export const searchMessagesQueryKey = (
  idProyecto: number,
  idConversacion: number,
  filtros: { q?: string; idAutor?: number; desde?: string; hasta?: string },
) => ['proyecto-conversaciones', idProyecto, idConversacion, 'busqueda', filtros] as const;

export const archivedConversationsQueryKey = (q: string) =>
  ['chats-archivados', q] as const;

/** Dock global de chat: cruza todos los proyectos del usuario. */
export const allConversationsQueryKey = (q: string = '') =>
  ['chats-global', q] as const;
