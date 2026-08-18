import { EstadoParticipacion } from '@prisma/client';

export type TeamMemberGroup =
  | 'ACTIVOS'
  | 'RETIRADOS_CON_CONTRIBUCION'
  | 'RETIRADOS_SIN_CONTRIBUCION';

export interface TeamSummaryRoleDto {
  idRolProyecto: number;
  nombreRol: string;
}

export interface TeamSummaryMemberDto {
  idUsuario: number;
  nombre: string;
  apellido: string;
  correo: string;
  fotoUrl: string | null;
  roles: TeamSummaryRoleDto[];
  estadoParticipacion: EstadoParticipacion;
  grupo: TeamMemberGroup;
  tareasActivas: number;
  tareasCompletadas: number;
  horasReconocidas: number;
}

export interface TeamSummaryLeaderDto {
  idUsuario: number;
  nombre: string;
  apellido: string;
  correo: string;
  fotoUrl: string | null;
}
