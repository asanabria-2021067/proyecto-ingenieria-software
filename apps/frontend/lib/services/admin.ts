import { apiFetch } from '@/lib/api/client';

// ─── Base types ───────────────────────────────────────────────────────────────

export type AdminUserStatus = 'ACTIVO' | 'INACTIVO' | 'BLOQUEADO';

export type AdminRole =
  | 'estudiante'
  | 'mentor'
  | 'lider_asociacion'
  | 'coordinador_academico'
  | 'administrador'
  | string;

export type EstadoProyectoAdmin = string;

// ─── GET /admin/estadisticas ──────────────────────────────────────────────────

export interface AdminActividadRecienteItem {
  idProyecto: number;
  tituloProyecto: string;
  estadoProyecto: string;
  fechaActualizacion: string | null;
}

export interface AdminEstudianteEnRiesgo {
  idUsuario: number;
  nombre: string;
  apellido: string;
  semestre: number | null;
  horasExtension: number;
  horasExtensionRequeridas: number;
}

export interface AdminStats {
  proyectosActivos: number;
  usuariosActivos: number;
  enRevision: number;
  cierrePendiente: number;
  usuariosBloqueados: number;
  nuevosInactivos2026: number;
  proyectosCerrados2026: number;
  actividadReciente: AdminActividadRecienteItem[];
  estudiantesEnRiesgo: AdminEstudianteEnRiesgo[];
}

export async function getAdminStats(): Promise<AdminStats> {
  return apiFetch<AdminStats>('/admin/estadisticas');
}

// ─── GET /admin/usuarios ──────────────────────────────────────────────────────

export interface ListAdminUsersParams {
  page?: number;
  limit?: number;
  search?: string;
  rol?: string;
  estado?: AdminUserStatus | '';
  year?: number | string;
}

export interface AdminUserRow {
  idUsuario: number;
  nombre: string;
  apellido: string;
  correo: string;
  fotoUrl: string | null;
  estado: AdminUserStatus;
  roles: string[];
  fechaCreacion: string;
}

export interface AdminUsersResponse {
  data: AdminUserRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function listAdminUsers(
  params?: ListAdminUsersParams,
): Promise<AdminUsersResponse> {
  if (!params) {
    return apiFetch<AdminUsersResponse>('/admin/usuarios');
  }

  const qs = new URLSearchParams();

  if (params.page !== undefined && params.page !== null) {
    qs.set('page', String(params.page));
  }
  if (params.limit !== undefined && params.limit !== null) {
    qs.set('limit', String(params.limit));
  }
  if (params.search !== undefined && params.search !== null && params.search !== '') {
    qs.set('search', params.search);
  }
  if (params.rol !== undefined && params.rol !== null && params.rol !== '') {
    qs.set('rol', params.rol);
  }
  if (params.estado !== undefined && params.estado !== null && params.estado !== '') {
    qs.set('estado', params.estado);
  }
  if (params.year !== undefined && params.year !== null && params.year !== '') {
    qs.set('year', String(params.year));
  }

  const query = qs.toString();
  return apiFetch<AdminUsersResponse>(query ? `/admin/usuarios?${query}` : '/admin/usuarios');
}

// ─── GET /admin/usuarios/:id ──────────────────────────────────────────────────

export interface AdminPerfilEstudiante {
  carrera: string | null;
  carne: string | null;
  semestre: number | null;
  disponibilidadHorasSemana: number | null;
  horasBecaRequeridas: number | null;
  horasExtensionRequeridas: number | null;
}

export interface AdminActividadEstudiante {
  participacionesActivas: number;
  horasBecaAcumuladas: number;
  horasExtensionAcumuladas: number;
  postulaciones: {
    pendientes: number;
    aceptadas: number;
    rechazadas: number;
  };
}

export interface AdminProyectoAsociadoMentor {
  idProyecto: number;
  tituloProyecto: string;
  estadoProyecto: string;
  rol: 'Mentor' | string;
}

export interface AdminActividadMentor {
  proyectosDondeParticipa: number;
  estudiantesMentorizados: number;
  proyectosActivos: number;
  proyectosCerrados: number;
  proyectosAsociados: AdminProyectoAsociadoMentor[];
}

export interface AdminProyectoRecienteLider {
  idProyecto: number;
  tituloProyecto: string;
  estadoProyecto: string;
  postulacionesPendientes: number;
}

export interface AdminActividadLider {
  proyectosCreados: number;
  proyectosActivos: number;
  proyectosCerrados: number;
  postulacionesPendientes: number;
  proyectosRecientes: AdminProyectoRecienteLider[];
}

export interface AdminProyectoRecienteCoordinador {
  idProyecto: number;
  tituloProyecto: string;
  estadoProyecto: string;
}

export interface AdminActividadCoordinador {
  proyectosSupervisados: number;
  proyectosActivos: number;
  proyectosCerrados: number;
  estudiantesVinculados: number;
  proyectosRecientes: AdminProyectoRecienteCoordinador[];
}

export interface AdminActividadAdmin {
  puedeGestionarUsuarios: boolean;
  puedeRevisarProyectos: boolean;
}

export interface AdminUserDetail {
  idUsuario: number;
  nombre: string;
  apellido: string;
  correo: string;
  fotoUrl: string | null;
  estado: AdminUserStatus;
  roles: string[];
  fechaCreacion: string;
  fechaUltimaSesion: string | null;
  perfilEstudiante: AdminPerfilEstudiante | null;
  actividadEstudiante: AdminActividadEstudiante | null;
  actividadMentor: AdminActividadMentor | null;
  actividadLider: AdminActividadLider | null;
  actividadCoordinador: AdminActividadCoordinador | null;
  actividadAdmin: AdminActividadAdmin | null;
}

export async function getAdminUserDetail(id: number | string): Promise<AdminUserDetail> {
  if (id === null || id === undefined || id === '') {
    throw new Error('ID de usuario inválido');
  }
  return apiFetch<AdminUserDetail>(`/admin/usuarios/${id}`);
}

// ─── PATCH /admin/usuarios/:id/estado ────────────────────────────────────────

export interface UpdateAdminUserStatusResponse {
  idUsuario: number;
  nombre: string;
  apellido: string;
  correo: string;
  estado: AdminUserStatus;
  roles: string[];
  fechaCreacion: string;
}

const VALID_STATUSES: AdminUserStatus[] = ['ACTIVO', 'INACTIVO', 'BLOQUEADO'];

export async function updateAdminUserStatus(
  id: number | string,
  estado: AdminUserStatus,
): Promise<UpdateAdminUserStatusResponse> {
  if (id === null || id === undefined || id === '') {
    throw new Error('ID de usuario inválido');
  }
  if (!VALID_STATUSES.includes(estado)) {
    throw new Error('Estado de usuario inválido');
  }
  return apiFetch<UpdateAdminUserStatusResponse>(`/admin/usuarios/${id}/estado`, {
    method: 'PATCH',
    body: JSON.stringify({ estado }),
  });
}
