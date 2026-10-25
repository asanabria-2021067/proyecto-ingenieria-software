import type { ModalidadEvento } from '@/lib/services/events';

/**
 * Contrato de lectura de `GET /admin/reuniones` (HU-195, T-362): reuniones de
 * Administración con uno o varios proyectos. Solo los campos que consume el
 * calendario administrativo; crear, editar y cancelar no se usan aquí.
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
}

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
