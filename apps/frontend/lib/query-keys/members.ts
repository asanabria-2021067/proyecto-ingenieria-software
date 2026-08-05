/**
 * Misma query key que ya usa `equipo/page.tsx` (`['proyecto-equipo', id]`),
 * reutilizada intencionalmente para compartir caché con esa página en vez
 * de introducir una clave equivalente distinta.
 */
export const projectMembersQueryKey = (idProyecto: number) => ['proyecto-equipo', idProyecto] as const;
