import {
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class HabilidadInputDto {
  @IsInt()
  idHabilidad: number;

  @IsEnum(['BASICO', 'INTERMEDIO', 'AVANZADO'])
  nivelHabilidad: 'BASICO' | 'INTERMEDIO' | 'AVANZADO';
}

export class ReplaceHabilidadesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HabilidadInputDto)
  habilidades: HabilidadInputDto[];
}

export class ReplaceInteresesDto {
  @IsArray()
  @IsInt({ each: true })
  intereses: number[];
}

export class ReplaceCualidadesDto {
  @IsArray()
  @IsInt({ each: true })
  cualidades: number[];
}

export class CreateExperienciaDto {
  @IsString()
  tituloProyectoExperiencia: string;

  @IsString()
  rolDesempenado: string;

  @IsOptional()
  @IsString()
  tipoExperiencia?: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  nombreCompleto?: string;

  @IsOptional()
  @IsEmail()
  @Matches(/@uvg\.edu\.gt$/, {
    message: 'Debe ser un correo institucional @uvg.edu.gt',
  })
  correoInstitucional?: string;

  @IsOptional()
  @IsInt()
  idCarrera?: number;

  @IsOptional()
  @IsString()
  carrera?: string;

  @IsOptional()
  @IsString()
  anioAcademico?: string;

  @IsOptional()
  @IsString()
  biografia?: string;

  @IsOptional()
  @IsString()
  disponibilidad?: string;

  @IsOptional()
  @IsString()
  modalidadPreferida?: string;

  @IsOptional()
  @IsString()
  horarioDisponible?: string;

  @IsOptional()
  @IsString()
  objetivoColaboracion?: string;

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
  @Min(0)
  @Max(168)
  disponibilidadHorasSemana?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  horasBecaRequeridas?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HabilidadInputDto)
  habilidades?: HabilidadInputDto[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  intereses?: number[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  cualidades?: number[];
}
