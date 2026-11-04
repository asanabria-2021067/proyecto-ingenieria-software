import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SolicitarDesactivacionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivo?: string;
}

export class ResolverDesactivacionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comentario?: string;
}
