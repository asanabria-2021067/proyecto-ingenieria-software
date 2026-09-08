import { Transform, Type } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

/**
 * C127 (06 v2 §41): payloads del ciclo de cierre de proyecto.
 *
 * Ninguno acepta del cliente lo que el servidor debe decidir: ni el
 * administrador, ni la fecha de aprobación, ni los importes acreditados, ni
 * la identidad de un documento. Lo que sí viaja es la EXPECTATIVA del cliente
 * —qué revisión creía estar enviando y con qué huella— para que el servidor
 * pueda rechazar una intención formada sobre datos ya obsoletos.
 */

/** Huella canónica: SHA-256 en hexadecimal minúsculo. */
export const FINGERPRINT_HEX_PATTERN = /^[0-9a-f]{64}$/;

/** Base común de las dos entregas: misma revisión, misma confirmación, misma huella. */
class ClosureDeliveryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  revisionId!: number;

  /**
   * Confirmación fuerte: el literal `true` y nada más. Un valor ausente o
   * `false` no es una confirmación, y aceptar cualquier valor «truthy»
   * convertiría un error de cliente en un cierre solicitado.
   */
  @IsBoolean()
  @Equals(true)
  confirmado!: boolean;

  /**
   * Huella del informe automático que el cliente vio. El servidor la compara
   * contra la que recalcula; nunca la usa como valor de verdad.
   */
  @IsString()
  @Matches(FINGERPRINT_HEX_PATTERN, {
    message: 'expectedFingerprint debe ser un SHA-256 hexadecimal en minúsculas',
  })
  expectedFingerprint!: string;
}

export class RequestCloseDto extends ClosureDeliveryDto {}

export class ResubmitClosureDto extends ClosureDeliveryDto {}

export class ApproveClosureDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  revisionId!: number;

  /** Huella de la ENTREGA sellada al enviar, no la del informe automático. */
  @IsString()
  @Matches(FINGERPRINT_HEX_PATTERN, {
    message: 'expectedFingerprint debe ser un SHA-256 hexadecimal en minúsculas',
  })
  expectedFingerprint!: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  comentario?: string;
}

/** Corrección documental: la revisión vuelve al líder sin reabrir la ejecución. */
export class CorrectionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  revisionId!: number;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  comentario!: string;
}

/**
 * Devolución a ejecución. El modo `{revisionId:null, legacy:true}` existe
 * ÚNICAMENTE para el proyecto legacy P-07, que quedó en solicitud de cierre
 * sin revisión: fuera de ese caso, devolver exige la revisión concreta.
 */
export class ReturnExecutionDto {
  @IsOptional()
  @Type(() => Number)
  @ValidateIf((objeto: ReturnExecutionDto) => objeto.legacy !== true)
  @IsInt()
  @Min(1)
  revisionId?: number | null;

  @IsOptional()
  @IsBoolean()
  @Equals(true)
  legacy?: boolean;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  comentario!: string;
}

/**
 * Barrido de purga. `dryRun` por defecto `true`: un barrido que destruye
 * objetos remotos no puede ser lo que ocurre cuando alguien olvida un
 * parámetro.
 */
export class SweepDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  dryRun?: boolean = true;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}

export class GenerateReportDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  revisionId!: number;
}

/**
 * Resultado de una operación de cierre. Reporta identificadores y cantidades
 * afectadas; nunca secretos, rutas del proveedor ni material criptográfico.
 */
export interface ClosureResult {
  projectId: number;
  estadoProyecto: string;
  revisionId: number | null;
  numeroRevision: number;
  fingerprintEntrega: string | null;
  informeOficialId: number | null;
  cantidades: Record<string, number>;
}
