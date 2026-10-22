import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsPositive, IsString, MaxLength, MinLength } from 'class-validator';

export class SendMessageDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: 'contenido no puede estar vacío' })
  @MaxLength(4000)
  contenido!: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  idMensajeCitado?: number;
}
