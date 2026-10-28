import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ModalidadEvento, PoliticaEdicionReunion } from '@prisma/client';
import { IsEnlaceDeSesion } from './create-event.dto';

/** Tope defensivo de proyectos por reunión y de editores seleccionados. */
export const MAX_PROYECTOS_POR_REUNION = 50;
export const MAX_EDITORES_POR_REUNION = 50;

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * HU-195 (T-362): crear una reunión de Administración. Mismas reglas de campo
 * que CreateEventDto. El servidor fija `tipoEvento` (REUNION), el creador,
 * `invitados` (todo el equipo) y `rolesDestino`; enviarlos es un 400 por el
 * `forbidNonWhitelisted` global. `modalidad` es obligatoria para que las
 * reglas de enlace y ubicación se apliquen siempre.
 */
export class CreateAdminMeetingDto {
  @Transform(recortar)
  @IsString()
  @MinLength(1, { message: 'tituloEvento no puede estar vacío' })
  @MaxLength(200)
  tituloEvento!: string;

  @ValidateIf((_object, value) => value !== undefined)
  @Transform(recortar)
  @IsString()
  @MaxLength(5000)
  descripcionEvento?: string;

  @IsDateString({}, { message: 'fechaInicio debe ser una fecha/hora válida (ISO 8601)' })
  fechaInicio!: string;

  @IsDateString({}, { message: 'fechaFin debe ser una fecha/hora válida (ISO 8601)' })
  fechaFin!: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(10080)
  antelacionMinutos?: number;

  @IsEnum(ModalidadEvento)
  modalidad!: ModalidadEvento;

  @ValidateIf((o: CreateAdminMeetingDto) => o.modalidad === ModalidadEvento.PRESENCIAL || o.modalidad === ModalidadEvento.MIXTA)
  @IsNumber()
  @Min(-90)
  @Max(90)
  ubicacionLat?: number;

  @ValidateIf((o: CreateAdminMeetingDto) => o.modalidad === ModalidadEvento.PRESENCIAL || o.modalidad === ModalidadEvento.MIXTA)
  @IsNumber()
  @Min(-180)
  @Max(180)
  ubicacionLng?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @Transform(recortar)
  @IsString()
  @MaxLength(255)
  ubicacionNombre?: string;

  @ValidateIf((o: CreateAdminMeetingDto) => o.modalidad === ModalidadEvento.VIRTUAL || o.modalidad === ModalidadEvento.MIXTA)
  @Transform(recortar)
  @IsEnlaceDeSesion()
  @MaxLength(500)
  linkSesion?: string;

  /** Proyectos convocados: se convoca a su equipo completo; no hay selección de estudiantes. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_PROYECTOS_POR_REUNION)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  proyectos!: number[];

  /** Omitida = TODOS_ADMINISTRADORES. */
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(PoliticaEdicionReunion)
  politicaEdicion?: PoliticaEdicionReunion;

  /** Solo con ADMINISTRADORES_SELECCIONADOS; cada uno debe ser administrador activo (lo valida el servicio). */
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(MAX_EDITORES_POR_REUNION)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  editores?: number[];
}
