import { Transform } from 'class-transformer';
import { IsString, MinLength } from 'class-validator';

export class CreateProgressRecordDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(200, { message: 'contenido debe tener al menos 200 caracteres significativos' })
  contenido!: string;
}
