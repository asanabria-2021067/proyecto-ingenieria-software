import { ServiceUnavailableException } from '@nestjs/common';

export const SERVICIO_NO_DISPONIBLE = 'SERVICIO_NO_DISPONIBLE';

/** 503 estable: el frontend reconoce `codigo` y muestra `message` junto al `servicio` afectado. */
export class ServicioNoDisponibleException extends ServiceUnavailableException {
  constructor(servicio: 'cloudinary', message: string) {
    super({ statusCode: 503, codigo: SERVICIO_NO_DISPONIBLE, servicio, message });
  }
}
