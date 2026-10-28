import { Transform } from 'class-transformer';
import { ArrayUnique, IsArray, IsInt, IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateChannelDto {
  // Se normaliza (sin # inicial, minúsculas) antes de validar: es la clave del unique.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().replace(/^#/, '').toLowerCase() : value))
  @IsString()
  @Length(2, 40)
  @Matches(/^[\p{L}\p{N}_-]+$/u, { message: 'nombre solo admite letras, números, guion y guion bajo' })
  nombre!: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  idsMiembros?: number[];
}
