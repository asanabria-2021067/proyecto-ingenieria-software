import { Transform } from 'class-transformer';
import { IsISO8601, IsString, MaxLength, MinLength } from 'class-validator';

export class ScheduleMessageDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: 'contenido no puede estar vacío' })
  @MaxLength(4000)
  contenido!: string;

  @IsISO8601({ strict: true })
  enviarEn!: string;
}
