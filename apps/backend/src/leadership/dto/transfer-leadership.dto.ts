import { Transform, Type } from 'class-transformer';
import { IsInt, IsString, MaxLength, Min, MinLength } from 'class-validator';

/**
 * C091 (06 v2 §18/§41): payload de una transferencia de liderazgo, tanto por
 * cambio administrativo directo como por aceptación de una apelación.
 *
 * `expectedLeaderId` NO es informativo: es la precondición de concurrencia que
 * impide aplicar una intención antigua a un líder que ya cambió. El motivo es
 * obligatorio porque el historial es append-only y sin motivo la fila no
 * explica nada. `appealId` nunca llega por body: procede de la ruta.
 */
export class TransferLeadershipDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idLiderNuevo!: number;

  /** Líder que el actor cree vigente; si ya no lo es, la operación responde 409. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedLeaderId!: number;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  motivo!: string;
}
