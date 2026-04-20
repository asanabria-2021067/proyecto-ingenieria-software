import { IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateMensajeRevisionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  contenido!: string;

  @IsOptional()
  @IsInt()
  idRevision?: number;
}
