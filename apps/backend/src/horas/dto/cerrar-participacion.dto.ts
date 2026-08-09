import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';


export class CerrarParticipacionDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  horasReconocidas?: number;

  @IsOptional()
  @IsString()
  @MinLength(10, {
    message: 'La justificación debe explicar el ajuste con al menos 10 caracteres',
  })
  justificacion?: string;
}
