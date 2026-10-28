import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export const CONTACTO_LIMITES = {
  nombre: 100,
  correo: 254,
  asunto: 150,
  mensaje: 2000,
} as const;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateContactoDto {
  @Transform(trim)
  @IsString({ message: 'El nombre debe ser texto' })
  @MinLength(1, { message: 'El nombre es obligatorio' })
  @MaxLength(CONTACTO_LIMITES.nombre, { message: `El nombre no puede exceder ${CONTACTO_LIMITES.nombre} caracteres` })
  nombre!: string;

  @Transform(trim)
  @IsString({ message: 'El correo debe ser texto' })
  @MinLength(1, { message: 'El correo es obligatorio' })
  @MaxLength(CONTACTO_LIMITES.correo, { message: `El correo no puede exceder ${CONTACTO_LIMITES.correo} caracteres` })
  @IsEmail({}, { message: 'El correo no tiene un formato válido' })
  correo!: string;

  @Transform(trim)
  @IsString({ message: 'El asunto debe ser texto' })
  @MinLength(1, { message: 'El asunto es obligatorio' })
  @MaxLength(CONTACTO_LIMITES.asunto, { message: `El asunto no puede exceder ${CONTACTO_LIMITES.asunto} caracteres` })
  asunto!: string;

  @Transform(trim)
  @IsString({ message: 'El mensaje debe ser texto' })
  @MinLength(1, { message: 'El mensaje es obligatorio' })
  @MaxLength(CONTACTO_LIMITES.mensaje, { message: `El mensaje no puede exceder ${CONTACTO_LIMITES.mensaje} caracteres` })
  mensaje!: string;
}
