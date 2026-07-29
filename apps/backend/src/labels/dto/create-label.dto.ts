import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { LABEL_COLOR_REGEX } from '../labels.constants';

export class CreateLabelDto {
  // Recorte externo únicamente (conserva mayúsculas/minúsculas, acentos y
  // espacios interiores del nombre visible). El cálculo de
  // `nombreNormalizado` vive exclusivamente en LabelsService.normalizeName.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: 'nombreEtiqueta no puede estar vacío' })
  @MaxLength(255)
  nombreEtiqueta!: string;

  // Sin trim: un color con espacios externos es inválido (Etiqueta.color
  // es VarChar(7), exactamente `#RRGGBB`).
  @IsString()
  @Matches(LABEL_COLOR_REGEX, { message: 'color debe tener el formato #RRGGBB' })
  color!: string;
}
