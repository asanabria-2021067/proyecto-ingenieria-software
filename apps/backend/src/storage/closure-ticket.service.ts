import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ClosureAvailability } from '../config/environment.validation';

/**
 * C112/C113 (06 v2 §26/§27/§51.1): gate ÚNICO de disponibilidad de la superficie de cierre
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

/** §26: la reserva de carga dura diez minutos; la lectura, cinco. */
export const CLOSURE_UPLOAD_TICKET_TTL_SECONDS = 600;
export const CLOSURE_READ_TICKET_TTL_SECONDS = 300;
/** El ticket viaja en un campo de formulario acotado. */
export const CLOSURE_TICKET_MAX_BYTES = 8192;

/**
 * Contenido del ticket de APLICACIÓN. No es una firma del proveedor: liga
 * quién, qué documento, de qué proyecto y revisión, con qué propósito y hasta
 * cuándo. El cliente nunca recibe credenciales de Cloudinary.
 */
export interface ClosureTicketPayload {
  purpose: ClosureTicketPurpose;
  documentId: number;
  projectId: number;
  revisionId: number;
  actorId: number;
  /** Segundos epoch; un ticket vencido no autoriza nada. */
  exp: number;
  /** Solo en lectura: ata el ticket al contenido concreto que se autorizó. */
  checksum?: string;
}

export const CLOSURE_TICKET_INVALID = 'El ticket de cierre no es válido';
export const CLOSURE_TICKET_EXPIRED = 'El ticket de cierre expiró';

@Injectable()
export class ClosureTicketService {
  constructor(private readonly config: ConfigService) {}

  /** Disponibilidad releída en cada operación: es una precondición, no un estado cacheado. */
  assertAvailable(): ClosureAvailability {
    return assertClosureAvailable(this.config.get<ClosureAvailability>('closure'));
  }

  /**
   * El secreto de tickets es INDEPENDIENTE de las KEKs (§27/§51.2): firmar y
   * cifrar son propósitos distintos, y compartir una clave entre ambos
   * convertiría la filtración de uno en la del otro.
   */
  private secret(): Buffer {
    this.assertAvailable();
    const raw = this.config.get<string>('CLOSURE_TICKET_HMAC_SECRET');
    if (!raw) {
      throw new ServiceUnavailableException(CLOSURE_NOT_CONFIGURED_MESSAGE);
    }
    return Buffer.from(raw, 'base64');
  }

  private mac(canonical: string): string {
    return createHmac('sha256', this.secret()).update(canonical, 'utf8').digest('base64url');
  }

  /** Orden de campos FIJO: la firma no puede depender del orden de un objeto. */
  private canonical(payload: ClosureTicketPayload): string {
    return [
      payload.purpose,
      payload.documentId,
      payload.projectId,
      payload.revisionId,
      payload.actorId,
      payload.exp,
      payload.checksum ?? '',
    ].join('|');
  }

  /** Emite el ticket. `exp` se calcula aquí: el cliente no propone su validez. */
  sign(
    payload: Omit<ClosureTicketPayload, 'exp'>,
    ttlSeconds?: number,
  ): { ticket: string; expiraEn: Date } {
    const ttl =
      ttlSeconds ??
      (payload.purpose === 'upload'
        ? CLOSURE_UPLOAD_TICKET_TTL_SECONDS
        : CLOSURE_READ_TICKET_TTL_SECONDS);
    const exp = Math.floor(Date.now() / 1000) + ttl;
    const completo: ClosureTicketPayload = { ...payload, exp };
    const cuerpo = Buffer.from(JSON.stringify(completo), 'utf8').toString('base64url');
    return {
      ticket: `${cuerpo}.${this.mac(this.canonical(completo))}`,
      expiraEn: new Date(exp * 1000),
    };
  }

  /**
   * Verifica firma y vigencia. Compara el MAC en tiempo constante y exige que
   * el ticket corresponda al propósito y al proyecto de la ruta: un ticket de
   * otro documento, otro proyecto u otro propósito no autoriza nada.
   */
  verify(
    ticket: string,
    esperado: { purpose: ClosureTicketPurpose; projectId: number; documentId?: number },
  ): ClosureTicketPayload {
    if (typeof ticket !== 'string' || Buffer.byteLength(ticket, 'utf8') > CLOSURE_TICKET_MAX_BYTES) {
      throw new UnauthorizedException(CLOSURE_TICKET_INVALID);
    }
    const [cuerpo, firma] = ticket.split('.');
    if (!cuerpo || !firma) {
      throw new UnauthorizedException(CLOSURE_TICKET_INVALID);
    }
    let payload: ClosureTicketPayload;
    try {
      payload = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8')) as ClosureTicketPayload;
    } catch {
      throw new UnauthorizedException(CLOSURE_TICKET_INVALID);
    }
    const esperada = Buffer.from(this.mac(this.canonical(payload)), 'utf8');
    const recibida = Buffer.from(firma, 'utf8');
    if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) {
      throw new UnauthorizedException(CLOSURE_TICKET_INVALID);
    }
    if (payload.exp * 1000 <= Date.now()) {
      throw new UnauthorizedException(CLOSURE_TICKET_EXPIRED);
    }
    if (payload.purpose !== esperado.purpose || payload.projectId !== esperado.projectId) {
      throw new UnauthorizedException(CLOSURE_TICKET_INVALID);
    }
    if (esperado.documentId !== undefined && payload.documentId !== esperado.documentId) {
      throw new UnauthorizedException(CLOSURE_TICKET_INVALID);
    }
    return payload;
  }
}
