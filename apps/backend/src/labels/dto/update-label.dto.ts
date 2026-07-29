import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { LABEL_COLOR_REGEX } from '../labels.constants';

// Ningún campo usa @IsOptional(): trata `null` igual que `undefined` (omite
// la validación en ambos casos), lo que aceptaría `null` silenciosamente.
// Se usa @ValidateIf en su lugar (mismo patrón que UpdateTaskDto) para
// distinguir omisión real (undefined, siempre válida) de un `null`
// explícito (inválido para ambos campos).
export class UpdateLabelDto {
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: 'nombreEtiqueta no puede estar vacío' })
  @MaxLength(255)
  nombreEtiqueta?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Matches(LABEL_COLOR_REGEX, { message: 'color debe tener el formato #RRGGBB' })
  color?: string;
}
