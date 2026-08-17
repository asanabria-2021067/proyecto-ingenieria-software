import { TeamSummaryLeaderDto, TeamSummaryMemberDto } from './team-summary-member.dto';

export interface TeamSummaryResponseDto {
  lider: TeamSummaryLeaderDto;
  miembros: TeamSummaryMemberDto[];
}
