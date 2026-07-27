import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class ForgotPasswordDto {
  @IsString()
  @IsNotEmpty()
  carne!: string;

  @IsEmail()
  @IsNotEmpty()
  correo!: string;
}
