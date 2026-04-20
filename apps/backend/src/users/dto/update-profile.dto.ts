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

export class HabilidadItemDto {
  @IsInt()
  idHabilidad!: number;

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
  // ==================== CAMPOS DE NOMBRE ====================
  @IsOptional()
  @IsString()
  @MinLength(2)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  apellido?: string;

  // Campo legacy (mantengo por compatibilidad si el frontend aún lo envía)
  @IsOptional()
  @IsString()
  @MinLength(2)
  nombreCompleto?: string;

  // ==================== CORREO INSTITUCIONAL ====================
  @IsOptional()
  @IsEmail()
  @Matches(/@uvg\.edu\.gt$/, {
    message: 'Debe ser un correo institucional @uvg.edu.gt',
  })
  correoInstitucional?: string;

  // ==================== CARRERA Y SEMESTRE ====================
  @IsOptional()
  @IsInt()
  idCarrera?: number | null;

  @IsOptional()
  @IsString()
  carrera?: string; // campo legacy

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  semestre?: number | null;

  @IsOptional()
  @IsString()
  anioAcademico?: string;

  // ==================== INFORMACIÓN GENERAL ====================
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

  // ==================== HORAS ====================
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(168)
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

  // ==================== ENLACES Y ARCHIVOS ====================
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

  // ==================== RELACIONES (para reemplazo masivo) ====================
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