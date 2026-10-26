import type { ModalidadEvento } from '@/lib/services/events';

/**
 * Contrato de `/admin/reuniones` (HU-195, T-362/T-363): reuniones de
 * Administración con uno o varios proyectos. Ver
 * `auditoria_backend_sprint10/05_API_CONTRATOS_HTTP.md` §1.
 */

export interface AdminMeetingPersona {
  idUsuario: number;
  nombre: string;
  apellido: string;
}

/** Contenido canónico de la reunión (idéntico en todas sus proyecciones). Instantes ISO 8601. */
export interface AdminMeetingContenido {
  tituloEvento: string;
  descripcionEvento: string | null;
  fechaInicio: string;
  fechaFin: string;
  modalidad: ModalidadEvento;
  ubicacionNombre: string | null;
  /** El backend siempre los envía; opcionales aquí porque el calendario no los necesita para pintar. */
  antelacionMinutos?: number;
  ubicacionLat?: number | null;
  ubicacionLng?: number | null;
  linkSesion?: string | null;
}

export interface AdminMeetingProyecto {
  idProyecto: number;
  idEvento: number;
  tituloProyecto: string;
  estadoProyecto: string;
}

export interface AdminMeeting {
  idReunion: number;
  estado: 'ACTIVA' | 'PASADA' | 'CANCELADA';
  /** Con proyecciones divergentes el backend no elige una: `contenido` llega en null. */
  integridad: 'OK' | 'INCONSISTENTE' | 'SIN_PROYECCIONES';
  contenido: AdminMeetingContenido | null;
  proyectos: AdminMeetingProyecto[];
  creador: AdminMeetingPersona;
  /** Si el administrador actual puede editarla y cancelarla (política de la reunión). */
  canManage?: boolean;
}

export type PoliticaEdicionReunion = 'TODOS_ADMINISTRADORES' | 'SOLO_CREADOR' | 'ADMINISTRADORES_SELECCIONADOS';

/** `GET /admin/reuniones/:id` (y la respuesta de POST, PATCH y DELETE): la reunión completa. */
export interface AdminMeetingDetalle extends AdminMeeting {
  version: number;
  contenido: (AdminMeetingContenido & Required<Pick<AdminMeetingContenido, 'antelacionMinutos' | 'ubicacionLat' | 'ubicacionLng' | 'linkSesion'>>) | null;
  politicaEdicion: PoliticaEdicionReunion;
  editores: AdminMeetingPersona[];
  creadaEn: string;
  actualizadaEn: string | null;
  canceladaEn: string | null;
  canManage: boolean;
  motivoGestion: 'POLITICA' | 'RESPALDO_CREADOR_SIN_AUTORIZACION' | null;
  /** Solo el creador vigente cambia la política y los editores. */
  puedeCambiarPolitica: boolean;
}

/** Cuerpo de POST (todos obligatorios salvo los marcados) y de PATCH (todo opcional más `version`). */
export interface AdminMeetingPayload {
  tituloEvento: string;
  descripcionEvento?: string;
  fechaInicio: string;
  fechaFin: string;
  antelacionMinutos: number;
  modalidad: ModalidadEvento;
  ubicacionLat?: number | null;
  ubicacionLng?: number | null;
  ubicacionNombre?: string | null;
  linkSesion?: string | null;
  proyectos: number[];
  politicaEdicion?: PoliticaEdicionReunion;
  editores?: number[];
}

/** `GET /admin/reuniones/proyectos-elegibles`: convocables para un rango, ordenados por título. */
export interface ProyectoElegibleReunion {
  idProyecto: number;
  tituloProyecto: string;
  estadoProyecto: string;
  lider: AdminMeetingPersona | null;
  integrantesConvocables: number;
  cierreOficial: string | null;
  /** Solo en un proyecto CERRADO: hasta cuándo se le puede convocar. */
  ventanaHasta: string | null;
}

/** Persona de un equipo: estado de cuenta y si recibe la convocatoria (solo cuentas ACTIVO). */
export interface PersonaDeEquipo extends AdminMeetingPersona {
  estadoCuenta: string;
  convocado: boolean;
}

/** `GET /admin/reuniones/equipos/:idProyecto`: el equipo que convocaría un proyecto. */
export interface EquipoDeProyectoReunion {
  idProyecto: number;
  tituloProyecto: string;
  descripcionProyecto: string | null;
  estadoProyecto: string;
  lider: PersonaDeEquipo | null;
  integrantes: (PersonaDeEquipo & { rol: string; estadoParticipacion: string })[];
  totalConvocados: number;
}

/** Motivos del 400 de elegibilidad (`proyectos[].motivo`). */
export type MotivoNoElegible =
  | 'PROYECTO_INEXISTENTE'
  | 'PROYECTO_ELIMINADO'
  | 'ESTADO_NO_ELEGIBLE'
  | 'SIN_FECHA_OFICIAL_CIERRE'
  | 'FUERA_DE_VENTANA_POSCIERRE';

export interface AdminMeetingPage {
  data: AdminMeeting[];
  total: number;
  page: number;
  totalPages: number;
}

/** `activas` = no canceladas que aún no terminan; `pasadas` = no canceladas ya terminadas. */
export type AdminMeetingEstadoListado = 'activas' | 'pasadas' | 'canceladas';

/** `GET /admin/reuniones/:id/participantes`: aquí solo interesa el total de personas convocadas. */
export interface AdminMeetingParticipantes {
  idReunion: number;
  totalDestinatariosUnicos: number;
}
