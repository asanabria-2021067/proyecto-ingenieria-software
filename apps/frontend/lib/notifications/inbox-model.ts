import {
  Activity,
  AtSign,
  Award,
  BadgeCheck,
  Bell,
  CalendarClock,
  ClipboardList,
  Clock3,
  Flag,
  FolderKanban,
  KeyRound,
  Landmark,
  MessageSquare,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import {
  NOTIFICATION_GROUP_IDS,
  NOTIFICATION_GROUP_LABEL,
  NOTIFICATION_TYPE_PRESENTATION,
  type NotificationGroupId,
} from '@/lib/notifications/preference-groups';
import {
  getNotificationLink,
  idUsuarioSeguro,
  type Notificacion,
} from '@/lib/services/notifications';
import { resolveTaskNotificationLink } from '@/components/notifications/task-notification-link';
import { resolveCommentNotificationLink } from '@/components/notifications/comment-notification-link';

/**
 * Sprint 10 — modelo PURO de la bandeja de notificaciones (sin React). Reutiliza
 * la taxonomía de preference-groups.ts: las categorías de la sidebar son los
 * mismos grupos de las preferencias, y cada una filtra por sus tipos reales.
 * No inventa una segunda clasificación ni fechas: todo sale del aviso.
 */

// ─── Categorías ──────────────────────────────────────────────────────────────

const GROUP_ICON: Record<NotificationGroupId, LucideIcon> = {
  tareas: ClipboardList,
  postulaciones: UserCheck,
  proyectos: FolderKanban,
  horas: Clock3,
  recordatorios: CalendarClock,
  contactos: UserPlus,
  cuenta: ShieldCheck,
  otras: Bell,
};

export interface InboxCategory {
  id: NotificationGroupId;
  titulo: string;
  icon: LucideIcon;
  /** Tipos reales del enum que la categoría abarca (orden del catálogo). */
  tipos: readonly string[];
}

/** Categorías con al menos un tipo conocido. «otras» no existe como filtro: no tiene tipos propios. */
export const INBOX_CATEGORIES: readonly InboxCategory[] = NOTIFICATION_GROUP_IDS.filter((id) => id !== 'otras')
  .map((id) => ({
    id,
    titulo: NOTIFICATION_GROUP_LABEL[id].titulo,
    icon: GROUP_ICON[id],
    tipos: Object.entries(NOTIFICATION_TYPE_PRESENTATION)
      .filter(([, presentacion]) => presentacion.grupo === id)
      .map(([tipo]) => tipo),
  }))
  .filter((categoria) => categoria.tipos.length > 0);

export function categoriaDeTipo(tipo: string): NotificationGroupId {
  return NOTIFICATION_TYPE_PRESENTATION[tipo]?.grupo ?? 'otras';
}

export function tituloDeCategoria(id: NotificationGroupId): string {
  return NOTIFICATION_GROUP_LABEL[id].titulo;
}

/** `ALGO_NUEVO` -> «Algo nuevo» para tipos que el catálogo no describe. */
export function etiquetaDeTipo(tipo: string): string {
  const conocido = NOTIFICATION_TYPE_PRESENTATION[tipo]?.etiqueta;
  if (conocido) return conocido;
  const texto = tipo.replace(/_+/g, ' ').trim().toLowerCase();
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : 'Aviso';
}

// ─── Icono por tipo ──────────────────────────────────────────────────────────

/** Heurística por palabra clave del tipo (30+ valores en TipoNotificacion):
 * evita mantener un mapa exhaustivo que se desactualiza con cada tipo nuevo. */
const TYPE_ICON_RULES: Array<[string, LucideIcon]> = [
  // HU-200: antes que 'COMENTARIO', que también coincide con MENCION_COMENTARIO.
  ['MENCION', AtSign],
  // Antes que 'TAREA'/'HITO'/'PROYECTO': COMENTARIO_TAREA es un comentario, no una tarea.
  ['COMENTARIO', MessageSquare],
  ['POSTULACION', UserCheck],
  ['TAREA', ClipboardList],
  ['HITO', Flag],
  ['CIERRE', FolderKanban],
  ['PROYECTO', FolderKanban],
  ['HORAS', Clock3],
  ['CERTIFICADO', Award],
  ['INSIGNIA', Award],
  ['MENSAJE', MessageSquare],
  ['AMISTAD', UserPlus],
  ['SEGUIDOR', UserPlus],
  ['LIDERAZGO', Users],
  ['APELACION', Users],
  ['ROL_', Users],
  ['ALERTA_SEGURIDAD', ShieldAlert],
  ['RECUPERACION', KeyRound],
  ['CUENTA', ShieldCheck],
  ['EVENTO', CalendarClock],
  ['REUNION', CalendarClock],
  ['CALENDARIO', CalendarClock],
];

export function iconoDeTipo(tipo: string): LucideIcon {
  return TYPE_ICON_RULES.find(([clave]) => tipo.includes(clave))?.[1] ?? Bell;
}

// ─── Agrupación por día (criterio HU-198: Hoy, Ayer, fecha) ──────────────────

export interface InboxDayGroup<T extends { creadaEn: string }> {
  /** `YYYY-MM-DD` local: clave estable para React y para la cabecera fija. */
  clave: string;
  etiqueta: string;
  items: T[];
}

function claveDia(fecha: Date): string {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Etiqueta del día del aviso respecto a `ahora` (local): Hoy, Ayer o la fecha larga. */
export function etiquetaDeDia(fecha: Date, ahora: Date): string {
  const hoy = claveDia(ahora);
  const ayer = claveDia(new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - 1));
  const clave = claveDia(fecha);
  if (clave === hoy) return 'Hoy';
  if (clave === ayer) return 'Ayer';
  return fecha.toLocaleDateString('es-GT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(fecha.getFullYear() !== ahora.getFullYear() ? { year: 'numeric' } : {}),
  });
}

/** Conserva el orden de entrada (el del servidor) dentro de cada grupo y entre grupos. */
export function agruparPorDia<T extends { creadaEn: string }>(items: readonly T[], ahora: Date = new Date()): InboxDayGroup<T>[] {
  const grupos: InboxDayGroup<T>[] = [];
  for (const item of items) {
    const fecha = new Date(item.creadaEn);
    const clave = claveDia(fecha);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.clave === clave) ultimo.items.push(item);
    else grupos.push({ clave, etiqueta: etiquetaDeDia(fecha, ahora), items: [item] });
  }
  return grupos;
}

/** Hora para avisos de hoy; día y mes corto para el resto (columna derecha de la fila). */
export function fechaCompacta(iso: string, ahora: Date = new Date()): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '';
  if (claveDia(fecha) === claveDia(ahora)) return fecha.toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' });
  return fecha.toLocaleDateString('es-GT', { day: 'numeric', month: 'short' });
}

export function fechaCompleta(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '';
  return fecha.toLocaleString('es-GT', { dateStyle: 'full', timeStyle: 'short' });
}

// ─── Lectura segura del payload ──────────────────────────────────────────────

type Datos = Record<string, unknown>;

function datosDe(n: Pick<Notificacion, 'datosJson'>): Datos | null {
  return n.datosJson && typeof n.datosJson === 'object' ? (n.datosJson as Datos) : null;
}

function texto(datos: Datos | null, clave: string): string | null {
  const valor = datos?.[clave];
  if (typeof valor === 'string') return valor.trim() || null;
  if (typeof valor === 'number' && Number.isFinite(valor)) return String(valor);
  return null;
}

export interface ProyectoDeAviso {
  id: number | null;
  titulo: string | null;
}

/** Proyecto referenciado por el payload (`projectId`/`idProyecto` + `projectTitle`), si lo hay. */
export function proyectoDeAviso(n: Pick<Notificacion, 'datosJson'>): ProyectoDeAviso | null {
  const datos = datosDe(n);
  if (!datos) return null;
  const id = idUsuarioSeguro(datos.projectId) ?? idUsuarioSeguro(datos.idProyecto);
  const titulo = texto(datos, 'projectTitle');
  if (id === null && titulo === null) return null;
  return { id, titulo };
}

// ─── Identidad visual del emisor (avatar contextual) ─────────────────────────

/**
 * Campo del payload que nombra a la PERSONA que originó el aviso, por tipo.
 * Lista cerrada y verificada contra las plantillas del backend: el mismo
 * campo puede ser el destinatario en otro tipo (p. ej. `userName` en
 * CUENTA_VERIFICADA es quien recibe), así que nunca se lee un nombre fuera de
 * esta tabla, y nunca se extrae del texto del mensaje.
 */
const CAMPO_ACTOR: Readonly<Record<string, string>> = {
  NUEVA_POSTULACION: 'userName',
  ROL_ABANDONADO: 'userName',
  ROL_ASIGNADO_LIDER: 'userName',
  SOLICITUD_AMISTAD: 'userName',
  AMISTAD_ACEPTADA: 'userName',
  NUEVO_SEGUIDOR: 'userName',
  SOLICITUD_RECUPERACION_CONTRASENA: 'userName',
  CUENTA_PENDIENTE_VERIFICACION: 'userName',
  APELACION_LIDERAZGO_RECIBIDA: 'leaderName',
  CALENDARIO_COMPARTIDO: 'ownerName',
  MENCION_COMENTARIO: 'autorNombre',
};

/** Decisiones de Administración sin responsable individual en el payload. */
const TIPOS_INSTITUCIONALES = new Set([
  'REUNION_PROGRAMADA',
  'REUNION_ACTUALIZADA',
  'REUNION_CANCELADA',
  'PROYECTO_APROBADO',
  'PROYECTO_OBSERVADO',
  'CIERRE_APROBADO',
  'CIERRE_RECHAZADO',
  'CIERRE_CORRECCION_DOCUMENTAL',
  'CIERRE_DEVUELTO_A_EJECUCION',
  'CUENTA_VERIFICADA',
]);

/** Avisos que emite la plataforma sola (cron, cálculos, umbrales): siempre icono, aunque nombren un proyecto. */
const ICONO_AUTOMATICO: Readonly<Record<string, LucideIcon>> = {
  RECORDATORIO_EVENTO: CalendarClock,
  TAREA_POR_VENCER: CalendarClock,
  HORAS_CONSOLIDADAS: Clock3,
  HORAS_ACREDITADAS: BadgeCheck,
  HORAS_VALIDADAS: BadgeCheck,
  CERTIFICADO_EMITIDO: Award,
  INSIGNIA_OBTENIDA: Award,
  PROYECTO_ADVERTENCIA_INACTIVIDAD: Activity,
  CAMBIO_ESTADO_PROYECTO: Activity,
  POSTULACION_RECHAZADA_POR_CIERRE: Activity,
  ALERTA_SEGURIDAD: ShieldAlert,
};

export type IdentidadDeAviso =
  | { tipo: 'persona'; nombre: string; iniciales: string }
  | { tipo: 'institucion'; nombre: string; icon: LucideIcon }
  | { tipo: 'proyecto'; nombre: string; iniciales: string }
  | { tipo: 'sistema'; nombre: string | null; icon: LucideIcon };

const CONECTORES = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'en', 'para', 'con', 'a', 'al']);

/**
 * Hasta dos iniciales de las primeras palabras con significado («Plataforma de Tutorías» → «PT»).
 * Las etiquetas entre corchetes o paréntesis («[S7 UI] Plataforma…») no cuentan, salvo que no quede nada más.
 */
export function inicialesDe(nombre: string): string {
  const sinEtiquetas = nombre.replace(/\[[^\]]*\]|\([^)]*\)/g, ' ');
  const base = /\p{L}|\d/u.test(sinEtiquetas) ? sinEtiquetas : nombre;
  const palabras = base.trim().split(/\s+/).filter((p) => /\p{L}|\d/u.test(p));
  const utiles = palabras.filter((p) => !CONECTORES.has(p.toLowerCase()));
  const fuente = utiles.length > 0 ? utiles : palabras;
  return fuente
    .slice(0, 2)
    .map((p) => (p.match(/\p{L}|\d/u)?.[0] ?? '').toLocaleUpperCase('es'))
    .join('');
}

/**
 * Quién o qué originó el aviso, en orden fijo y comprobable:
 *  1. persona identificada por un campo estructurado de su tipo (CAMPO_ACTOR);
 *  2. Administración, para sus decisiones sin responsable en el payload;
 *  3. evento automático (icono propio);
 *  4. proyecto, si el payload trae su nombre;
 *  5. icono del tipo (Cuenta y seguridad se presenta como la plataforma).
 * El payload no trae fotos: una persona se muestra con iniciales.
 */
export function identidadDeAviso(n: Pick<Notificacion, 'tipoNotificacion' | 'datosJson'>): IdentidadDeAviso {
  const datos = datosDe(n);
  const tipo = n.tipoNotificacion;
  const campoActor = CAMPO_ACTOR[tipo];
  const actor = campoActor ? texto(datos, campoActor) : null;
  const inicialesActor = actor ? inicialesDe(actor) : '';
  if (actor && inicialesActor) return { tipo: 'persona', nombre: actor, iniciales: inicialesActor };
  if (TIPOS_INSTITUCIONALES.has(tipo)) return { tipo: 'institucion', nombre: 'Administración', icon: Landmark };
  const automatico = ICONO_AUTOMATICO[tipo];
  const cuenta = categoriaDeTipo(tipo) === 'cuenta';
  if (automatico) return { tipo: 'sistema', nombre: cuenta ? 'Plataforma UVGenius' : null, icon: automatico };
  const proyecto = texto(datos, 'projectTitle');
  const inicialesProyecto = proyecto ? inicialesDe(proyecto) : '';
  if (proyecto && inicialesProyecto && !cuenta) return { tipo: 'proyecto', nombre: proyecto, iniciales: inicialesProyecto };
  return { tipo: 'sistema', nombre: cuenta ? 'Plataforma UVGenius' : null, icon: iconoDeTipo(tipo) };
}

/** Quién origina el aviso (línea «De:»), la misma identidad que el avatar. Nunca ids ni correos; un proyecto ya va en su chip. */
export function origenDeAviso(n: Pick<Notificacion, 'tipoNotificacion' | 'datosJson'>): string | null {
  const identidad = identidadDeAviso(n);
  return identidad.tipo === 'proyecto' ? null : identidad.nombre;
}

export interface DetalleDeAviso {
  etiqueta: string;
  valor: string;
}

/**
 * Campos del payload que se muestran como «detalles estructurados», solo si
 * existen. Lista cerrada: cualquier otra clave (ids, tokens, rutas) no se
 * renderiza. Los avisos de Cuenta y seguridad no exponen ningún detalle
 * (OWASP25-C038: su `datosJson` nunca se muestra).
 */
const CAMPOS_DETALLE: ReadonlyArray<[clave: string, etiqueta: string]> = [
  ['eventTitle', 'Evento'],
  ['fechaInicioTexto', 'Fecha programada'],
  ['taskTitle', 'Tarea'],
  ['tituloContexto', 'Contexto'],
  ['roleName', 'Rol'],
  ['numeroSprint', 'Sprint'],
  ['horasReportadas', 'Horas reportadas'],
  ['horasPropuestas', 'Horas propuestas'],
  ['previousLeaderName', 'Líder anterior'],
  ['newLeaderName', 'Nuevo líder'],
  ['oldStatus', 'Estado anterior'],
  ['newStatus', 'Estado nuevo'],
  ['insigniaNombre', 'Insignia'],
  ['nivelNombre', 'Nivel'],
  ['numeroRevision', 'Revisión'],
  ['numeroEnvio', 'Envío'],
  ['taskCount', 'Tareas afectadas'],
];

export function detallesDeAviso(n: Pick<Notificacion, 'tipoNotificacion' | 'datosJson'>): DetalleDeAviso[] {
  if (categoriaDeTipo(n.tipoNotificacion) === 'cuenta') return [];
  const datos = datosDe(n);
  if (!datos) return [];
  const detalles: DetalleDeAviso[] = [];
  for (const [clave, etiqueta] of CAMPOS_DETALLE) {
    const valor = texto(datos, clave);
    if (valor !== null) detalles.push({ etiqueta, valor });
  }
  return detalles;
}

/** Estado propio de las reuniones de Administración (HU-195), para el visor. */
export function estadoDeReunion(tipo: string): 'programada' | 'actualizada' | 'cancelada' | null {
  if (tipo === 'REUNION_PROGRAMADA') return 'programada';
  if (tipo === 'REUNION_ACTUALIZADA') return 'actualizada';
  if (tipo === 'REUNION_CANCELADA') return 'cancelada';
  return null;
}

// ─── Acción de navegación ────────────────────────────────────────────────────

export interface AccionDeAviso {
  href: string;
  etiqueta: string;
}

function etiquetaDeDestino(href: string, tipo: string): string {
  if (href.startsWith('/dashboard/calendario')) return 'Ver en calendario';
  if (href.startsWith('/dashboard/mis-horas')) return 'Ver mis horas';
  if (href.startsWith('/dashboard/mis-postulaciones')) return 'Ver mis postulaciones';
  if (/\/postulaciones$/.test(href)) return 'Ver postulaciones';
  if (/\/kanban\/tasks\//.test(href)) return tipo.includes('COMENTARIO') || tipo.includes('MENCION') ? 'Ver comentario' : 'Ver tarea';
  if (href.includes('/kanban')) return 'Ver tablero';
  if (href.startsWith('/dashboard/projects/') || href.startsWith('/dashboard/proyectos/')) return 'Ver proyecto';
  if (href.startsWith('/dashboard/admin/')) return 'Ir a administración';
  return 'Abrir';
}

/**
 * Destino del aviso con la misma cadena de resolución que la campana. Una
 * reunión cancelada no enlaza: el evento ya no existe en el calendario.
 */
export function accionDeAviso(n: Pick<Notificacion, 'tipoNotificacion' | 'datosJson'>): AccionDeAviso | null {
  if (n.tipoNotificacion === 'REUNION_CANCELADA') return null;
  const href = getNotificationLink(n) ?? resolveTaskNotificationLink(n) ?? resolveCommentNotificationLink(n);
  if (!href) return null;
  return { href, etiqueta: etiquetaDeDestino(href, n.tipoNotificacion) };
}

export interface SegmentoDeMensaje {
  texto: string;
  /** Lo que el aviso cita entre comillas (la tarea, el rol, el proyecto…): el «asunto» que se destaca. */
  destacado: boolean;
}

/** Comillas que usan los mensajes del backend: rectas, angulares y tipográficas. */
const CITA = /"([^"\n]+)"|«([^»\n]+)»|“([^”\n]+)”/g;

/**
 * Parte la vista previa en texto normal y citas. Las comillas quedan en el
 * texto normal; solo lo citado se destaca. Sin citas, un solo segmento.
 */
export function segmentosDeMensaje(texto: string): SegmentoDeMensaje[] {
  const segmentos: SegmentoDeMensaje[] = [];
  let desde = 0;
  for (const m of texto.matchAll(CITA)) {
    const cita = m[1] ?? m[2] ?? m[3] ?? '';
    const inicio = m.index ?? 0;
    const apertura = m[0][0];
    const cierre = m[0][m[0].length - 1];
    segmentos.push({ texto: texto.slice(desde, inicio) + apertura, destacado: false }, { texto: cita, destacado: true });
    desde = inicio + m[0].length;
    segmentos.push({ texto: cierre, destacado: false });
  }
  segmentos.push({ texto: texto.slice(desde), destacado: false });
  return segmentos.filter((s) => s.texto.length > 0);
}
