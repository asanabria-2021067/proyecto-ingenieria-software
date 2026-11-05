import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateBienvenidaDto {
  /** null o vacio = usar el mensaje por defecto. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  mensaje?: string | null;
}
