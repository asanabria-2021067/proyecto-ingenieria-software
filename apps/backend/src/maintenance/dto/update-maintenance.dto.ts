import { IsBoolean, IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateMaintenanceDto {
  @IsBoolean()
  activo!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  mensaje?: string | null;

  @IsOptional()
  @IsDateString()
  regresoEstimado?: string | null;

  @IsOptional()
  @IsDateString()
  inicioProgramado?: string | null;
}
