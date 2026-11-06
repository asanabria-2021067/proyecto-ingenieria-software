export interface Miga {
  label: string;
  href?: string;
}

// Rutas del dashboard que existen como pagina (sin /dashboard/admin, que trae su propia miga).
// Solo estas se enlazan: un tramo intermedio sin pagina se muestra como texto.
const RUTAS = [
  'ayuda',
  'calendario',
  'chats/archivados',
  'coordinador',
  'configuracion',
  'mensajes',
  'mensajes/*',
  'mis-horas',
  'mis-postulaciones',
  'mis-proyectos',
  'mis-tareas',
  'notificaciones',
  'organizaciones',
  'organizaciones/*',
  'organizaciones/*/editar',
  'organizaciones/nueva',
  'perfil',
  'perfil/editar',
  'personas',
  'personas/*',
  'projects/*',
  'projects/mine',
  'projects/mine/*',
  'projects/mine/form',
  'projects/*/kanban',
  'projects/*/tareas',
  'proyectos',
  'proyectos/*',
  'proyectos/*/equipo',
  'proyectos/*/miembros',
  'proyectos/*/sprints',
  'proyectos/*/sprints/*',
].map((r) => new RegExp(`^${r.replace(/\*/g, '[^/]+')}$`));

const ETIQUETAS: Record<string, string> = {
  ayuda: 'Centro de ayuda',
  calendario: 'Calendario',
  chats: 'Chats',
  coordinador: 'Coordinador',
  pendientes: 'Pendientes',
  cierres: 'Cierres',
  archivados: 'Archivados',
  configuracion: 'Configuración',
  mensajes: 'Mensajes',
  'mis-horas': 'Mis horas',
  'mis-postulaciones': 'Mis postulaciones',
  'mis-proyectos': 'Mis proyectos',
  'mis-tareas': 'Mis tareas',
  notificaciones: 'Notificaciones',
  organizaciones: 'Organizaciones',
  perfil: 'Perfil',
  personas: 'Personas',
  projects: 'Proyectos',
  proyectos: 'Proyectos',
  mine: 'Mis proyectos',
  reviews: 'Solicitudes de publicación',
  admin: 'Administración',
  editar: 'Editar',
  nueva: 'Nueva',
  form: 'Formulario',
  asistencia: 'Asistencia',
  bitacora: 'Bitácora',
  equipo: 'Equipo',
  liderazgo: 'Liderazgo',
  miembros: 'Miembros',
  postulaciones: 'Postulaciones',
  'solicitudes-salida': 'Solicitudes de salida',
  postular: 'Postular',
  reportes: 'Reportes',
  sprints: 'Sprints',
  analytics: 'Analítica',
  finalizar: 'Finalizar',
  revision: 'Revisión',
  informes: 'Informes',
  burndown: 'Burndown',
  velocidad: 'Velocidad',
  tablero: 'Tablero',
  kanban: 'Tablero',
  tareas: 'Tareas',
  asociacion: 'Asociación',
};

// Etiqueta de un tramo dinamico (id) segun el tramo anterior.
const ETIQUETA_ID: Record<string, string> = {
  proyectos: 'Proyecto',
  projects: 'Proyecto',
  mine: 'Proyecto',
  organizaciones: 'Organización',
  personas: 'Perfil',
  mensajes: 'Conversación',
  asociacion: 'Mi asociación',
  sprints: 'Sprint',
  equipo: 'Integrante',
  postular: 'Rol',
};

// Pantallas que ya dibujan su propia miga de pan.
const CON_MIGA_PROPIA = [
  /^\/dashboard\/admin(\/|$)/,
  /^\/dashboard\/projects\/admin(\/|$)/,
  /^\/dashboard\/mensajes(\/|$)/, // pantalla completa del chat
  /^\/dashboard\/notificaciones$/, // bandeja a la altura de la ventana
  /^\/dashboard\/projects\/[^/]+\/kanban\/tasks\//,
  /^\/dashboard\/projects\/[^/]+\/(cierre|salida)(\/|$)/,
  /^\/dashboard\/proyectos\/[^/]+$/,
];

// Layouts que ya fijan la altura de la ventana (h-[calc(100vh-4rem)]): la miga va dentro de ellos, no encima.
const EN_LAYOUT_DE_PROYECTO = /^\/dashboard\/(projects|proyectos)\/(?!mine|admin)[^/]+(\/|$)/;

export const migaEnLayout = (pathname: string) => EN_LAYOUT_DE_PROYECTO.test(limpiar(pathname));

const esId = (s: string) => /^\d+$/.test(s) || /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(s);

function construir(limpia: string): Miga[] {
  const tramos = limpia.slice('/dashboard/'.length).split('/');
  const migas: Miga[] = [{ label: 'Inicio', href: '/dashboard' }];
  tramos.forEach((tramo, i) => {
    const ruta = tramos.slice(0, i + 1).join('/');
    const previo = tramos[i - 1] ?? '';
    const label = esId(tramo) ? (ETIQUETA_ID[previo] ?? 'Detalle') : (ETIQUETAS[tramo] ?? tramo);
    const enlazable = i < tramos.length - 1 && RUTAS.some((r) => r.test(ruta));
    migas.push({ label, href: enlazable ? `/dashboard/${ruta}` : undefined });
  });
  return migas;
}

const limpiar = (pathname: string) => pathname.split(/[?#]/)[0].replace(/\/+$/, '');

/** Migas de una ruta interna; `null` si es el inicio o la pantalla ya trae la suya. */
export function migasDe(pathname: string): Miga[] | null {
  const limpia = limpiar(pathname);
  if (!limpia.startsWith('/dashboard/') || CON_MIGA_PROPIA.some((r) => r.test(limpia))) return null;
  return construir(limpia);
}

/** Nombre legible de una ruta del estudiante («Proyecto / Sprints»); `null` si no es retomable. */
export function etiquetaDeRuta(pathname: string): string | null {
  const limpia = limpiar(pathname);
  if (!limpia.startsWith('/dashboard/') || /^\/dashboard\/(projects\/)?admin(\/|$)/.test(limpia)) return null;
  return construir(limpia).slice(1).map((m) => m.label).join(' / ');
}
