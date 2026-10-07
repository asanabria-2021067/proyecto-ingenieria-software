import {
  IsEmail,
  IsString,
  IsNotEmpty,
  IsInt,
  Min,
  Max,
  MinLength,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { FORMATO_CORREO_INSTITUCIONAL, normalizarCorreo } from '../correo-institucional.util';

export class RegisterDto {
  @Transform(({ value }) => (typeof value === 'string' ? normalizarCorreo(value) : value))
  @IsEmail()
  @Matches(FORMATO_CORREO_INSTITUCIONAL, {
    message: 'El correo debe tener las primeras letras de tu apellido, tu carné y terminar en @uvg.edu.gt',
  })
  correo!: string;

  @IsString()
  @MinLength(8)
  contrasena!: string;

  @IsString()
  @IsNotEmpty()
  nombre!: string;

  @IsString()
  @IsNotEmpty()
  apellido!: string;

  @IsString()
  @IsNotEmpty()
  carne!: string;

  @IsInt()
  idCarrera!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  semestre!: number;
}
