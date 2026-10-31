import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  // Mismo tope que el registro y lib/validators/contrasena.ts del frontend.
  @MaxLength(72)
  nuevaContrasena!: string;
}
