import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class DashboardReporteQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  anio?: number;

  @IsOptional()
  @Type(() => Number)
  @IsIn([1, 2])
  periodo?: 1 | 2;

  @IsOptional()
  @IsIn(['BECA', 'EXTENSION'])
  tipo?: 'BECA' | 'EXTENSION';

  @IsOptional()
  // enableImplicitConversion convierte 'false' en true antes de @Transform; se lee el valor crudo
  @Transform(({ obj }) => obj.enRiesgo === true || obj.enRiesgo === 'true')
  @IsBoolean()
  enRiesgo?: boolean;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  busqueda?: string;
}

export class DashboardEstudiantesQueryDto extends DashboardReporteQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  cursor?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
