import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class BajaIntegranteDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : value))
  @IsString()
  @MinLength(10, { message: 'El motivo debe tener al menos 10 caracteres' })
  @MaxLength(500, { message: 'El motivo no puede superar 500 caracteres' })
  motivo!: string;
}
