import { Transform } from 'class-transformer';
import { IsEnum, IsISO8601, IsString, MaxLength, MinLength } from 'class-validator';
import { NivelAnuncio } from '@prisma/client';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Anuncio de una organización o asociación: la audiencia la define la entidad, no el autor. */
export class CreateAnuncioEntidadDto {
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'titulo no puede estar vacío' })
  @MaxLength(120)
  titulo!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'mensaje no puede estar vacío' })
  @MaxLength(1000)
  mensaje!: string;

  @IsEnum(NivelAnuncio)
  nivel!: NivelAnuncio;

  @IsISO8601()
  fechaInicio!: string;

  @IsISO8601()
  fechaFin!: string;
}
