import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsNumber, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { TipoActividad } from '@prisma/client';

const TIPOS_ACTIVIDAD: TipoActividad[] = ['REUNION', 'JORNADA', 'TALLER', 'OTRO'];

/** T-295/T-296 (HU-177): alta de una actividad del proyecto, exclusiva del líder. */
export class CreateActividadDto {
}
