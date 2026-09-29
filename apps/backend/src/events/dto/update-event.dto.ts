import { Transform } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ModalidadEvento } from '@prisma/client';

/**
 * HU-169 (T-263): edición parcial. Mismo patrón que UpdateLabelDto/UpdateTaskDto:
 * @ValidateIf en vez de @IsOptional, para rechazar `null` explícito y aceptar
 * solo la omisión real del campo.
 */
export class UpdateEventDto {
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: 'tituloEvento no puede estar vacío' })
  @MaxLength(200)
  tituloEvento?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
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

  // Requerido cuando modalidad es PRESENCIAL o MIXTA (mapa del frontend).
  @ValidateIf((o: UpdateEventDto) => o.modalidad === ModalidadEvento.PRESENCIAL || o.modalidad === ModalidadEvento.MIXTA)
  @IsNumber()
  @Min(-90)
  @Max(90)
  ubicacionLat?: number;

  @ValidateIf((o: UpdateEventDto) => o.modalidad === ModalidadEvento.PRESENCIAL || o.modalidad === ModalidadEvento.MIXTA)
  @IsNumber()
  @Min(-180)
  @Max(180)
  ubicacionLng?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(255)
  ubicacionNombre?: string;

  // Requerido cuando modalidad es VIRTUAL o MIXTA.
  @ValidateIf((o: UpdateEventDto) => o.modalidad === ModalidadEvento.VIRTUAL || o.modalidad === ModalidadEvento.MIXTA)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { message: 'linkSesion debe ser una URL http/https válida' })
  @MaxLength(500)
  linkSesion?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @IsInt({ each: true })
  rolesDestino?: number[];
}
