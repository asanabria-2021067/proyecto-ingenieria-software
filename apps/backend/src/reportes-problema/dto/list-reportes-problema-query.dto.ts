import { IsEnum, IsOptional } from 'class-validator';
import { EstadoReporteProblema } from '@prisma/client';

export class ListReportesProblemaQueryDto {
  @IsOptional()
  @IsEnum(EstadoReporteProblema, { message: 'El estado debe ser PENDIENTE o ATENDIDO' })
  estado?: EstadoReporteProblema;
}
