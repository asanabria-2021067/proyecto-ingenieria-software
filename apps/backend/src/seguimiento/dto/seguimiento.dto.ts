import { Transform } from 'class-transformer';
import { IsInt, IsString, MaxLength, MinLength } from 'class-validator';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** MEJ-57: a quién se reconoce y por qué (uno por persona por Sprint). */
export class CrearReconocimientoDto {
  @IsInt()
  idReceptor!: number;

  @Transform(recortar)
  @IsString()
  @MinLength(3, { message: 'El mensaje debe tener al menos 3 caracteres' })
  @MaxLength(280, { message: 'El mensaje no puede pasar de 280 caracteres' })
  mensaje!: string;
}

/** MEJ-24: retrospectiva opcional del Sprint. */
export class GuardarRetrospectivaDto {
  @Transform(recortar)
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  quePaso!: string;

  @Transform(recortar)
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  quePodriaMejorar!: string;

  @Transform(recortar)
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  acuerdos!: string;
}
