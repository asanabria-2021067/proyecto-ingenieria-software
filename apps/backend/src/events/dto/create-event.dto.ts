import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
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
  isURL,
  registerDecorator,
} from 'class-validator';
import { ModalidadEvento, TipoEvento } from '@prisma/client';
import { isHttpUrl } from '../../common/validators/http-url.validator';

/**
 * G04 (UI-24): política única del enlace de una sesión, la misma que aplica
 * el formulario (`esEnlaceDeSesionValido` en event-form.schema.ts):
 *  1. URL absoluta http/https con host y sin espacios, caracteres de control ni
 *     invisibles (contrato OWASP G07, `isHttpUrl`): `javascript:`, `data:`,
 *     `vbscript:`, `file:` o esquemas propios quedan fuera.
 *  2. Dominio real: con TLD (o una IP), sin guion bajo, sin `<` ni `>`
 *     (`isURL` de class-validator, como ya exigía este DTO).
 * No hay excepción de desarrollo: `http://localhost:3000` no es un enlace que
 * otra persona pueda abrir, así que tampoco se acepta fuera de producción.
 */
export function esEnlaceDeSesion(value: unknown): boolean {
  return typeof value === 'string' && isHttpUrl(value) && isURL(value, { protocols: ['http', 'https'], require_protocol: true });
}

export function IsEnlaceDeSesion(): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isEnlaceDeSesion',
      target: target.constructor,
      propertyName: String(propertyName),
      options: { message: `${String(propertyName)} debe ser una URL http/https válida` },
      validator: { validate: (value: unknown) => esEnlaceDeSesion(value) },
    });
  };
}

/**
 * HU-169 (T-263): creación de un evento de calendario del proyecto.
 * fechaInicio/fechaFin validan formato ISO 8601 aquí; las reglas "fechaFin >
 * fechaInicio" y "fechaInicio no anterior a ahora" se validan en
 * EventsService (mensaje legible del 400, no un cruce de campos crudo de
 * class-validator).
 */
export class CreateEventDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: 'tituloEvento no puede estar vacío' })
  @MaxLength(200)
  tituloEvento!: string;

  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(5000)
  descripcionEvento?: string;

  @IsDateString({}, { message: 'fechaInicio debe ser una fecha/hora válida (ISO 8601)' })
  fechaInicio!: string;

  @IsDateString({}, { message: 'fechaFin debe ser una fecha/hora válida (ISO 8601)' })
  fechaFin!: string;

  // Default documentado (T-265): 60 minutos antes de fechaInicio.
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(10080) // 7 días en minutos: tope razonable de antelación
  antelacionMinutos?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(ModalidadEvento)
  modalidad?: ModalidadEvento;

  // Requerido cuando modalidad es PRESENCIAL o MIXTA (mapa del frontend).
  @ValidateIf((o: CreateEventDto) => o.modalidad === ModalidadEvento.PRESENCIAL || o.modalidad === ModalidadEvento.MIXTA)
  @IsNumber()
  @Min(-90)
  @Max(90)
  ubicacionLat?: number;

  @ValidateIf((o: CreateEventDto) => o.modalidad === ModalidadEvento.PRESENCIAL || o.modalidad === ModalidadEvento.MIXTA)
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
  @ValidateIf((o: CreateEventDto) => o.modalidad === ModalidadEvento.VIRTUAL || o.modalidad === ModalidadEvento.MIXTA)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsEnlaceDeSesion()
  @MaxLength(500)
  linkSesion?: string;

  // idRolProyecto destinatarios. DEUDA (G04, UI-23): el dato se recibe y se guarda, pero ningún
  // filtro de lectura lo aplica y el diálogo ya no lo edita; ver docs/deuda-tecnica-sprint9.md.
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @IsInt({ each: true })
  rolesDestino?: number[];

  // HU-184: categoría del evento (color en el calendario). Omitido = OTRO al crear.
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(TipoEvento)
  tipoEvento?: TipoEvento;

  // HU-184: idUsuario invitados; deben ser integrantes del proyecto (lo valida
  // EventsService). Vacío/omitido = todo el proyecto.
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(200)
  @IsInt({ each: true })
  invitados?: number[];
}
