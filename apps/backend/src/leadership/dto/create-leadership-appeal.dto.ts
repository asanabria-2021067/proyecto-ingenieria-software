import { Transform, Type } from 'class-transformer';
import { IsInt, IsString, MaxLength, Min, MinLength } from 'class-validator';

/**
 * C091 (06 v2 §19/§41): payload de creación de una apelación de liderazgo.
 *
 * El texto se recorta antes de validar porque CK10 exige en base de datos que
 * `asunto` y `mensaje` no queden vacíos tras `btrim`: aceptar `'   '` aquí
 * solo trasladaría el rechazo a un error de constraint en vez de un 400.
 *
 * No viaja ninguna decisión de Q1: el efecto sobre la membresía del líder
 * saliente se deriva del estado real al transferir (§6), nunca de un booleano
 * que el cliente haya visto antes.
 */
export class CreateLeadershipAppealDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  asunto!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  mensaje!: string;

  /** Sucesor sugerido; su elegibilidad se revalida bajo transacción al resolver. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idCandidatoPropuesto!: number;
}
