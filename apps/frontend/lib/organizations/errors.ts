import { getApiErrorMessage, getApiErrorStatus } from '@/components/projects/api-error';

/**
 * Las reglas de organización (propietario que no puede salir, rol que no se degrada, invitación vencida…)
 * llegan del servicio como 400/403/409 con un texto pensado para la persona: se muestra tal cual.
 * Todo lo demás pasa por el traductor general de errores.
 */
export function mensajeErrorOrganizacion(error: unknown): string {
  const status = getApiErrorStatus(error);
  if ((status === 400 || status === 403 || status === 409) && error instanceof Error && error.message) {
    return error.message;
  }
  return getApiErrorMessage(error, 'general');
}
