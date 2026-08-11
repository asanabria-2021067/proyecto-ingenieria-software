import { TeamSummaryLeaderDto, TeamSummaryMemberDto } from './team-summary-member.dto';

/**
 * Contrato de respuesta de `GET /proyectos/:id/miembros/resumen`.
 *
 * `lider` y `miembros` se modelan por separado: el líder proviene de
 * `Proyecto.creadoPor` (ver {@link TeamSummaryLeaderDto}) y no forma parte
 * de la lista `miembros`, la cual es person-centric sobre
 * `ParticipacionProyecto` (ver {@link TeamSummaryMemberDto}).
 */
export interface TeamSummaryResponseDto {
  lider: TeamSummaryLeaderDto;
  miembros: TeamSummaryMemberDto[];
}
