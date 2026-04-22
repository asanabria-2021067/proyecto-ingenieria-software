import { IsEnum, IsOptional, IsString } from 'class-validator';

export class ResolverRevisionDto {
  @IsEnum(['APROBADA', 'OBSERVADA'], {
    message: "resultado debe ser 'APROBADA' o 'OBSERVADA'",
  })
  resultado!: 'APROBADA' | 'OBSERVADA';

  @IsOptional()
  @IsString()
  comentario?: string;
}
