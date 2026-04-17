import {
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

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
  @IsString()
  carrera?: string;

  @IsOptional()
  @IsString()
  anioAcademico?: string;

  @IsOptional()
  @IsString()
  biografia?: string;

  @IsOptional()
  @IsArray()
  habilidades?: string[];

  @IsOptional()
  @IsArray()
  intereses?: string[];

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
}
