import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { TipoEvidencia } from '@prisma/client';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * ENLACE: URL https cualquiera. ARCHIVO: URL de Cloudinary (misma validacion
 * que las fotos). El formato de la URL segun el tipo lo valida EvidenceService.
 */
export class CreateEvidenceDto {
  @IsEnum([TipoEvidencia.ENLACE, TipoEvidencia.ARCHIVO], { message: 'tipoEvidencia debe ser ENLACE o ARCHIVO' })
  tipoEvidencia!: 'ENLACE' | 'ARCHIVO';

  @Transform(trim)
  @IsString()
  @MaxLength(255)
  urlRecurso!: string;

  @ValidateIf((_object, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  descripcion?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(26_214_400)
  tamanoBytes?: number;
}
