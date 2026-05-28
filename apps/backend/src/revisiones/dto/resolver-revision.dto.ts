import { IsEnum, IsOptional, IsString, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';

export class ResolverRevisionDto {
  @IsEnum(['APROBADA', 'OBSERVADA'], {
    message: "resultado debe ser 'APROBADA' o 'OBSERVADA'",
  })
  resultado!: 'APROBADA' | 'OBSERVADA';

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() ? value : undefined))
  comentario?: string;
}
