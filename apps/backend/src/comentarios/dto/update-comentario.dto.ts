import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateComentarioDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  contenido!: string;
}
