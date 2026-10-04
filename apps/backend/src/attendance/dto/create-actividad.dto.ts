import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsNumber, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { TipoActividad } from '@prisma/client';

const TIPOS_ACTIVIDAD: TipoActividad[] = ['REUNION', 'JORNADA', 'TALLER', 'OTRO'];

/** T-295/T-296 (HU-177): alta de una actividad del proyecto, exclusiva del líder. */
export class CreateActividadDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: 'tituloActividad no puede estar vacío' })
  @MaxLength(200)
  tituloActividad!: string;

  @IsIn(TIPOS_ACTIVIDAD, { message: `tipoActividad debe ser uno de: ${TIPOS_ACTIVIDAD.join(', ')}` })
  tipoActividad!: TipoActividad;

  @IsDateString({}, { message: 'fechaActividad debe ser una fecha válida (YYYY-MM-DD)' })
  fechaActividad!: string;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0.01, { message: 'horasValor debe ser mayor a 0' })
  horasValor!: number;
}
