import { IsOptional, IsString, IsInt, Min, Max, IsUrl } from 'class-validator';

export class UpdateProfileDto {
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
  @Min(1)
  @Max(80)
  disponibilidadHorasSemana?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  horasBecaRequeridas?: number;
}

export class ReplaceHabilidadesDto {
  habilidades!: HabilidadItemDto[];
}

export class HabilidadItemDto {
  @IsInt()
  idHabilidad!: number;

  @IsString()
  nivelHabilidad!: 'BASICO' | 'INTERMEDIO' | 'AVANZADO';
}

export class ReplaceInteresesDto {
  intereses!: number[];
}

export class ReplaceCualidadesDto {
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
