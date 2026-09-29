import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

/** Menú de 3 puntos del chat: cada acción manda un único campo a la vez. */
export class UpdateConversationDto {
  @IsOptional()
  @IsBoolean()
  archivada?: boolean;

  @IsOptional()
  @IsBoolean()
  esFavorita?: boolean;

  @IsOptional()
  @IsBoolean()
  silenciada?: boolean;

  @IsOptional()
  @IsBoolean()
  esPrioritaria?: boolean;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(120)
  nombrePersonalizado?: string | null;
}
