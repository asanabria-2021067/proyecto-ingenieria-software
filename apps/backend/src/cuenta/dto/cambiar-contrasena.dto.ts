import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';

export class CambiarContrasenaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  contrasenaActual!: string;

  @IsString()
  @MinLength(8)
  // Mismo tope que el registro y lib/validators/contrasena.ts del frontend.
  @MaxLength(72)
  nuevaContrasena!: string;
}
