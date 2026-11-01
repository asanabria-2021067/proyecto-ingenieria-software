import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class HorasCentralQueryDto {
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
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idCarrera?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idAsociacion?: number;

  @IsOptional()
  // enableImplicitConversion convierte 'false' en true antes de @Transform; se lee el valor crudo
  @Transform(({ obj }) => obj.enRiesgo === true || obj.enRiesgo === 'true')
  @IsBoolean()
  enRiesgo?: boolean;
}

export class HorasCentralListQueryDto extends HorasCentralQueryDto {
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
