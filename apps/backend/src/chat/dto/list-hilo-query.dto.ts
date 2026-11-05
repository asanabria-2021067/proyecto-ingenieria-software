import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class ListHiloQueryDto {
  /** Id de la respuesta mas antigua ya cargada. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(1)
  cursor?: number;
}
