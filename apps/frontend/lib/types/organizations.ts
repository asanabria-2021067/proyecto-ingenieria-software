import type { ChatMensaje, ChatUsuario } from '@/lib/types/chat';

export const ROLES_ORGANIZACION = ['PROPIETARIO', 'ADMINISTRADOR', 'EDITOR', 'LECTURA'] as const;
export type RolOrganizacion = (typeof ROLES_ORGANIZACION)[number];

export type VisibilidadOrganizacion = 'PUBLICA' | 'PRIVADA';

export interface UsuarioOrganizacion {
  idUsuario: number;
  nombre: string;
  apellido: string;
  fotoUrl: string | null;
}

export interface OrganizacionResumen {
  idOrganizacion: number;
  nombreOrganizacion: string;
  descripcionOrganizacion: string | null;
  sitioWeb: string | null;
  logoUrl: string | null;
  visibilidad: VisibilidadOrganizacion;
  fechaCreacion: string;
  archivada: boolean;
  miRol: RolOrganizacion | null;
  puedePublicar: boolean;
}

/** `GET /organizaciones/mias` */
export interface MiOrganizacion extends OrganizacionResumen {
  totalMiembros: number;
  totalProyectos: number;
}

export interface ProyectoMuestra {
  idProyecto: number;
  tituloProyecto: string;
  estadoProyecto: string;
}

/** Item de `GET /organizaciones/buscar` */
export interface OrganizacionPublica extends OrganizacionResumen {
  totalMiembros: number;
  totalProyectos: number;
  solicitudPendiente: boolean;
  proyectos: ProyectoMuestra[];
}

export interface BusquedaOrganizaciones {
  data: OrganizacionPublica[];
  total: number;
  page: number;
  totalPages: number;
}

export interface MiembroOrganizacion extends UsuarioOrganizacion {
  rolOrganizacion: RolOrganizacion;
  fechaIngreso: string;
}

export interface AvanceProyectoOrganizacion {
  total: number;
  hecho: number;
  porcentaje: number;
}

export interface ProyectoDeOrganizacion {
  idProyecto: number;
  tituloProyecto: string;
  tipoProyecto: string;
  estadoProyecto: string;
  fechaPublicacion: string | null;
  creador: UsuarioOrganizacion;
  publicadoPor: string;
  avance: AvanceProyectoOrganizacion;
}

/** `GET /organizaciones/:id`; `miembros` y los contadores solo llegan a quien es miembro / gestor. */
export interface OrganizacionDetalle extends OrganizacionResumen {
  totalMiembros: number;
  miembros: MiembroOrganizacion[] | null;
  proyectos: ProyectoDeOrganizacion[];
  invitacionesPendientes: number | null;
  solicitudesPendientes: number | null;
  solicitudPendiente: boolean;
}

export interface InvitacionOrganizacion {
  idInvitacion: number;
  rolOrganizacion: RolOrganizacion;
  creadaEn: string;
  venceEn: string;
  invitado: UsuarioOrganizacion;
  invitadoPor: UsuarioOrganizacion;
}

/** `GET /organizaciones/invitaciones/mias` */
export interface MiInvitacion {
  idInvitacion: number;
  rolOrganizacion: RolOrganizacion;
  creadaEn: string;
  venceEn: string;
  organizacion: {
    idOrganizacion: number;
    nombreOrganizacion: string;
    logoUrl: string | null;
    visibilidad: VisibilidadOrganizacion;
  };
  invitadoPor: UsuarioOrganizacion;
}

export interface SolicitudUnirse {
  idSolicitud: number;
  creadaEn: string;
  venceEn: string;
  usuario: UsuarioOrganizacion;
}

export interface CrearOrganizacionInput {
  nombreOrganizacion: string;
  descripcionOrganizacion?: string;
  visibilidad: VisibilidadOrganizacion;
  logoUrl?: string;
  sitioWeb?: string;
}

export type ActualizarOrganizacionInput = Partial<CrearOrganizacionInput>;

export interface InvitarInput {
  idUsuario?: number;
  correo?: string;
  rolOrganizacion: RolOrganizacion;
}

export interface CanalOrganizacion {
  idConversacion: number;
  idOrganizacion: number;
  nombre: string | null;
  archivada: boolean;
  miembros: ChatUsuario[];
}

export type MensajeOrganizacion = ChatMensaje;
