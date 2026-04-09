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

export class RegisterDto {
  @IsEmail()
  @Matches(/@uvg\.edu\.gt$/, { message: 'El correo debe ser @uvg.edu.gt' })
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
