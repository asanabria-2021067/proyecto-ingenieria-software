import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListLinksQueryDto {
  /** Id del ultimo mensaje escaneado de la pagina anterior. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(1)
  cursor?: number;

  /** Mensajes a escanear por pagina (no enlaces). */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(50)
  limite?: number;
}
