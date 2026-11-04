import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { IsCloudinaryUrl } from '../../common/validators/cloudinary-url.validator';

export const REPORTE_LIMITES = {
  ruta: 300,
  userAgent: 300,
  descripcion: 2000,
  urlCaptura: 500,
} as const;

// Quita caracteres de control (conserva salto de línea y tabulación) y espacios en los extremos.
const limpiar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim() : value;

export class CreateReporteProblemaDto {
  @Transform(limpiar)
  @IsString({ message: 'La ruta debe ser texto' })
  @MinLength(1, { message: 'La ruta es obligatoria' })
  @MaxLength(REPORTE_LIMITES.ruta, { message: `La ruta no puede exceder ${REPORTE_LIMITES.ruta} caracteres` })
  ruta!: string;

  @Transform(limpiar)
  @IsString({ message: 'El navegador debe ser texto' })
  @MinLength(1, { message: 'El navegador es obligatorio' })
  @MaxLength(REPORTE_LIMITES.userAgent, { message: `El navegador no puede exceder ${REPORTE_LIMITES.userAgent} caracteres` })
  userAgent!: string;

  @Transform(limpiar)
  @IsString({ message: 'La descripción debe ser texto' })
  @MinLength(1, { message: 'La descripción es obligatoria' })
  @MaxLength(REPORTE_LIMITES.descripcion, { message: `La descripción no puede exceder ${REPORTE_LIMITES.descripcion} caracteres` })
  descripcion!: string;

  @IsOptional()
  @IsString({ message: 'La captura debe ser una URL' })
  @MaxLength(REPORTE_LIMITES.urlCaptura, { message: `La captura no puede exceder ${REPORTE_LIMITES.urlCaptura} caracteres` })
  @IsCloudinaryUrl()
  urlCaptura?: string;
}
