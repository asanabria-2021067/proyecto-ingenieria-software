import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Matches, Min, ValidateNested } from 'class-validator';
import { MAX_ENLACES } from '../enlaces-perfil.service';

const aEnteros = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && value.trim().length > 0 ? value.split(',').map(Number) : Array.isArray(value) ? value.map(Number) : value;

export class UpdatePortafolioDto {
  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @IsBoolean()
  indexable?: boolean;
}

export class BloqueDisponibleDto {
  @IsInt()
  @Min(0)
  @Max(6)
  dia!: number;

  @IsInt()
  @Min(0)
  @Max(23)
  hora!: number;
}

export class ReplaceDisponibilidadDto {
  @IsArray()
  @ArrayMaxSize(168)
  @ValidateNested({ each: true })
  @Type(() => BloqueDisponibleDto)
  bloques!: BloqueDisponibleDto[];
}

export class ReplaceEnlacesDto {
  @IsArray()
  @ArrayMaxSize(MAX_ENLACES)
  @IsString({ each: true })
  @MaxLength(2048, { each: true })
  urls!: string[];
}

export class AsistenteReunionesQueryDto {
  /** Ids de los invitados, separados por coma. */
  @Transform(aEnteros)
  @IsArray()
  @ArrayMaxSize(10)
  @IsInt({ each: true })
  @Min(1, { each: true })
  invitados!: number[];

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  desde?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(14)
  dias?: number;

  /** Duracion de la reunion en horas completas. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(4)
  horas?: number;
}
