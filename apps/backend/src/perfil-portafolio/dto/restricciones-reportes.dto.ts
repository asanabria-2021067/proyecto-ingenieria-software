import { IsEnum, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { EstadoReportePerfil, MotivoReportePerfil } from '@prisma/client';

export class CrearReportePerfilDto {
  @IsInt()
  @Min(1)
  idReportado!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  idMensaje?: number;

  @IsEnum(MotivoReportePerfil)
  motivo!: MotivoReportePerfil;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  detalle?: string;
}

export class ListarReportesPerfilQueryDto {
  @IsOptional()
  @IsEnum(EstadoReportePerfil)
  estado?: EstadoReportePerfil;
}

export class ResolverReportePerfilDto {
  @IsIn(['descartar', 'actuar'])
  accion!: 'descartar' | 'actuar';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  nota?: string;
}
