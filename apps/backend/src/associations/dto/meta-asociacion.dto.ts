import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { TipoHorasMeta } from '@prisma/client';

export class MetaPorcentajeDto {
  @IsInt()
  @Min(1)
  @Max(100)
  porcentajeObjetivo!: number;
}

export class CrearMetaAsociacionDto extends MetaPorcentajeDto {
  @IsInt()
  @Min(2000)
  @Max(2100)
  anio!: number;

  @IsIn([1, 2])
  periodo!: 1 | 2;

  @IsEnum(TipoHorasMeta)
  tipo!: TipoHorasMeta;
}

export class ListarMetasQueryDto {
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
}
