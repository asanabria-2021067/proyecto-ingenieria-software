import {
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  IsArray,
  ValidateNested,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  nombre?: string;

  @IsOptional()
  @IsString()
  apellido?: string;

  @IsOptional()
  @IsString()
  biografia?: string;

  @IsOptional()
  @IsString()
  fotoUrl?: string;

  @IsOptional()
  @IsString()
  enlacePortafolio?: string;

  @IsOptional()
  @IsString()
  githubUrl?: string;

  @IsOptional()
  @IsString()
  linkedinUrl?: string;

  @IsOptional()
  @IsString()
  urlCv?: string;

  @IsOptional()
  @IsInt()
  idCarrera?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  semestre?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(80)
  disponibilidadHorasSemana?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(500)
  horasBecaRequeridas?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(500)
  horasExtensionRequeridas?: number | null;
}

export class HabilidadItemDto {
  @IsInt()
  idHabilidad!: number;

  @IsString()
  @IsEnum(['BASICO', 'INTERMEDIO', 'AVANZADO'])
  nivelHabilidad!: 'BASICO' | 'INTERMEDIO' | 'AVANZADO';

  @IsOptional()
  @IsInt()
  @Min(0)
  aniosExperiencia?: number;
}

export class ReplaceHabilidadesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HabilidadItemDto)
  habilidades!: HabilidadItemDto[];
}

export class ReplaceInteresesDto {
  @IsArray()
  @IsInt({ each: true })
  intereses!: number[];
}

export class ReplaceCualidadesDto {
  @IsArray()
  @IsInt({ each: true })
  cualidades!: number[];
}

export class CreateExperienciaDto {
  @IsString()
  tituloProyectoExperiencia!: string;

  @IsOptional()
  @IsString()
  rolDesempenado?: string;

  @IsOptional()
  @IsString()
  tipoExperiencia?: 'PROYECTO_UNIVERSITARIO' | 'PASANTIA' | 'VOLUNTARIADO' | 'INVESTIGACION' | 'OTRO';
}
