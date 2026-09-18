import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsInt,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateHitoDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: 'tituloHito no puede estar vacío' })
  @MaxLength(255)
  tituloHito!: string;

  // Igual que descripcionTarea en CreateTaskDto: @ValidateIf en vez de
  // @IsOptional para rechazar `null` explícito y aceptar solo la omisión real.
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  descripcionHito?: string;

  // Opcional a propósito: a diferencia de Tarea.fechaLimite, la fecha límite
  // de un hito puede ser un objetivo ya conocido del proyecto, no
  // necesariamente futura, así que no se reutiliza IsFutureCalendarDate.
  @ValidateIf((_object, value) => value !== undefined)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'fechaLimite debe tener el formato YYYY-MM-DD',
  })
  fechaLimite?: string;

  // T-186 (HU-147): asignación masiva opcional en la misma operación —
  // permite crear el hito y aplicarlo de una vez a tareas existentes del
  // proyecto (típicamente tareas antiguas sin hito, que T-185 dejó
  // atrapadas sin poder pasar al tablero/sprint). Mismo patrón que
  // idsEtiquetas en CreateTaskDto.
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  idsTareas?: number[];
}
