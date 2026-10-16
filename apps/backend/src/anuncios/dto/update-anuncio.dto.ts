import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AudienciaAnuncio, NivelAnuncio } from '@prisma/client';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class UpdateAnuncioDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'titulo no puede estar vacío' })
  @MaxLength(120)
  titulo?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'mensaje no puede estar vacío' })
  @MaxLength(1000)
  mensaje?: string;

  @IsOptional()
  @IsEnum(NivelAnuncio)
  nivel?: NivelAnuncio;

  @IsOptional()
  @IsEnum(AudienciaAnuncio)
  audiencia?: AudienciaAnuncio;

  @IsOptional()
  @IsISO8601()
  fechaInicio?: string;

  @IsOptional()
  @IsISO8601()
  fechaFin?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
