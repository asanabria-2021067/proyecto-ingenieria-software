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
import { MAX_EDITORES_POR_REUNION, MAX_PROYECTOS_POR_REUNION } from './create-admin-meeting.dto';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * HU-195 (T-362): edición parcial. Igual que UpdateEventDto: omitir un campo
 * es no tocarlo y `null` solo se admite en los metadatos de modalidad
 * (ubicación y enlace), donde significa limpiarlo. `proyectos`, si viene,
 * REEMPLAZA el conjunto convocado (mínimo uno). `version` es obligatoria: la
 * que el cliente leyó; si otro administrador cambió la reunión antes, es 409.
 */
export class UpdateAdminMeetingDto {
  @IsInt()
  @Min(1)
  version!: number;

  @ValidateIf((_object, value) => value !== undefined)
  @Transform(recortar)
  @IsString()
  @MinLength(1, { message: 'tituloEvento no puede estar vacío' })
  @MaxLength(200)
  tituloEvento?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @Transform(recortar)
  @IsString()
  @MaxLength(5000)
  descripcionEvento?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsDateString({}, { message: 'fechaInicio debe ser una fecha/hora válida (ISO 8601)' })
  fechaInicio?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsDateString({}, { message: 'fechaFin debe ser una fecha/hora válida (ISO 8601)' })
  fechaFin?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(10080)
  antelacionMinutos?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(ModalidadEvento)
  modalidad?: ModalidadEvento;

  @ValidateIf((o: UpdateAdminMeetingDto) => o.modalidad === ModalidadEvento.PRESENCIAL || o.modalidad === ModalidadEvento.MIXTA)
  @IsNumber()
  @Min(-90)
  @Max(90)
  ubicacionLat?: number | null;

  @ValidateIf((o: UpdateAdminMeetingDto) => o.modalidad === ModalidadEvento.PRESENCIAL || o.modalidad === ModalidadEvento.MIXTA)
  @IsNumber()
  @Min(-180)
  @Max(180)
  ubicacionLng?: number | null;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @Transform(recortar)
  @IsString()
  @MaxLength(255)
  ubicacionNombre?: string | null;

  @ValidateIf((o: UpdateAdminMeetingDto) => o.modalidad === ModalidadEvento.VIRTUAL || o.modalidad === ModalidadEvento.MIXTA)
  @Transform(recortar)
  @IsEnlaceDeSesion()
  @MaxLength(500)
  linkSesion?: string | null;

  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_PROYECTOS_POR_REUNION)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  proyectos?: number[];

  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(PoliticaEdicionReunion)
  politicaEdicion?: PoliticaEdicionReunion;

  /** `[]` vacía la lista de editores; omitido la conserva. */
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(MAX_EDITORES_POR_REUNION)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  editores?: number[];
}
