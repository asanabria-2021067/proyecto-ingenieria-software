import { Transform } from 'class-transformer';
import { IsEnum, IsISO8601, IsString, MaxLength, MinLength } from 'class-validator';
import { AudienciaAnuncio, NivelAnuncio } from '@prisma/client';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateAnuncioDto {
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

  @IsEnum(AudienciaAnuncio)
  audiencia!: AudienciaAnuncio;

  @IsISO8601()
  fechaInicio!: string;

  @IsISO8601()
  fechaFin!: string;
}
