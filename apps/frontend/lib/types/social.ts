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
