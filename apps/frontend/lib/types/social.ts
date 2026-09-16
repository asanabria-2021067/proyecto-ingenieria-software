export interface UsuarioResumenDto {
  idUsuario: number;
  nombre: string;
  apellido: string;
  fotoUrl: string | null;
}

export type EstadoAmistad = 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA';

export interface AmistadDto {
  idAmistad: number;
  estado: EstadoAmistad;
}

export interface SolicitudAmistadPendienteDto {
  idAmistad: number;
  estado: EstadoAmistad;
  fechaSolicitud: string;
  solicitante: UsuarioResumenDto;
}

export interface UsuarioBusquedaDto extends UsuarioResumenDto {
  esAmigo: boolean;
  solicitudPendiente: { direccion: 'enviada' | 'recibida' } | null;
  loSigo: boolean;
  carrera: string | null;
  semestre: number | null;
  /** Motivo estructurado: el backend nunca manda el texto ya armado. */
  mismaCarrera: boolean;
  amigosEnComun: number;
  habilidades: string[];
  intereses: string[];
}

export interface ProyectoParticipacionResumenDto {
  idProyecto: number;
  tituloProyecto: string;
  estadoProyecto: string;
  rolNombre: string;
}

/** Perfil público de un usuario (GET /social/usuarios/:id). A diferencia de
 * `UsuarioBusquedaDto`, `amigosEnComun` viene como lista (no solo conteo). */
export interface UsuarioPerfilDto extends UsuarioResumenDto {
  correo: string;
  esAmigo: boolean;
  solicitudPendiente: { direccion: 'enviada' | 'recibida' } | null;
  loSigo: boolean;
  carrera: string | null;
  semestre: number | null;
  mismaCarrera: boolean;
  amigosEnComun: UsuarioResumenDto[];
  habilidades: string[];
  intereses: string[];
  proyectosActivos: ProyectoParticipacionResumenDto[];
}

/** T-195: rangos fijos del filtro de semestre en Personas. "Todos" no es un
 * valor de este tipo: es la ausencia del filtro (`undefined`). */
export type SemestreRango = '1-4' | '5-7' | '8+';

export interface BuscarUsuariosFiltros {
  q?: string;
  carrera?: boolean;
  amigosDeAmigos?: boolean;
  soloAmigos?: boolean;
  habilidades?: number[];
  intereses?: number[];
  semestreRango?: SemestreRango;
  page?: number;
}

export interface BuscarUsuariosResultado {
  items: UsuarioBusquedaDto[];
  hasMore: boolean;
}

export interface ProyectoFeedDto {
  idProyecto: number;
  tituloProyecto: string;
  estadoProyecto: string;
  amigosParticipantes: UsuarioResumenDto[];
}

export interface FeedSocialDto {
  proyectosDeAmigos: ProyectoFeedDto[];
  proyectosDeSeguidos: ProyectoFeedDto[];
}
