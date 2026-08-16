import { Transform } from 'class-transformer';
import { IsBoolean, IsNumber, IsString, Min, MinLength, ValidateIf } from 'class-validator';

export class CloseAssignmentDto {
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  horasReales!: number;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(200, { message: 'contenidoAvance debe tener al menos 200 caracteres significativos' })
  contenidoAvance!: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  marcarComoHecha?: boolean;
}
