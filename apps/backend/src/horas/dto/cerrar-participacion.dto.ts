import { IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Cierre de una participación ACTIVA. `horasReconocidas` es opcional — si
 * se omite, el backend usa `horasCalculadas` tal cual. Si se envía y
 * difiere del valor calculado, `justificacion` es obligatoria (validado en
 * el service, porque depende del valor calculado en el momento del
 * cierre). Admite decimales (hasta 2 posiciones), no solo enteros.
 */
export class CerrarParticipacionDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  horasReconocidas?: number;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(10, {
    message: 'La justificación debe explicar el ajuste con al menos 10 caracteres',
  })
  justificacion?: string;
}
