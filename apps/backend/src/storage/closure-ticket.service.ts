import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ClosureAvailability } from '../config/environment.validation';

/**
 * C112 (06 v2 §51.1): gate ÚNICO de disponibilidad de la superficie de cierre
 * y esqueleto del servicio de tickets de aplicación.
 *
 * Con credenciales, KEKs o HMAC ausentes o inválidos el resto del backend
 * arranca y funciona con normalidad; lo que se deshabilita es exactamente lo
 * que necesita almacenamiento. El rechazo ocurre ANTES de reservar, firmar o
 * subir: sin configuración válida no se escribe una fila, no se firma un
 * parámetro y no se toca el SDK del proveedor.
 *
 * Nunca se fabrica un secreto efímero para «poder seguir»: una clave inventada
 * produciría documentos que nadie podrá volver a leer.
 */

export const CLOSURE_NOT_CONFIGURED_CODE = 'CLOSURE_NO_CONFIGURADO';
export const CLOSURE_NOT_CONFIGURED_MESSAGE =
  'El almacenamiento de documentos de cierre no está configurado';

/**
 * Lanza 503 `CLOSURE_NO_CONFIGURADO` cuando la superficie no puede operar.
 *
 * El cuerpo del error nombra las variables que faltan y los códigos de motivo
 * derivados por el validador, nunca sus VALORES: un diagnóstico útil no puede
 * convertirse en una filtración de configuración.
 */
export function assertClosureAvailable(closure: ClosureAvailability | undefined): ClosureAvailability {
  if (!closure || !closure.disponible) {
    throw new ServiceUnavailableException({
      statusCode: 503,
      code: CLOSURE_NOT_CONFIGURED_CODE,
      message: CLOSURE_NOT_CONFIGURED_MESSAGE,
      faltantes: closure?.faltantes ?? [],
      motivos: closure?.motivos ?? [],
    });
  }
  return closure;
}

/** Propósitos separados: un ticket de lectura jamás sirve para subir. */
export const CLOSURE_TICKET_PURPOSES = ['upload', 'read'] as const;
export type ClosureTicketPurpose = (typeof CLOSURE_TICKET_PURPOSES)[number];

@Injectable()
export class ClosureTicketService {
  constructor(private readonly config: ConfigService) {}

  /** Disponibilidad releída en cada operación: es una precondición, no un estado cacheado. */
  assertAvailable(): ClosureAvailability {
    return assertClosureAvailable(this.config.get<ClosureAvailability>('closure'));
  }

  /**
   * Firma de un ticket de aplicación. En C112 solo existe el gate: la
   * emisión HMAC llega con la superficie que la consume, de modo que hoy es
   * imposible entregar un ticket con configuración inválida.
   */
  sign(): never {
    this.assertAvailable();
    throw new ServiceUnavailableException('La emisión de tickets todavía no está habilitada');
  }

  verify(): never {
    this.assertAvailable();
    throw new ServiceUnavailableException('La verificación de tickets todavía no está habilitada');
  }
}
