/**
 * Traduce el error enriquecido de `apiFetch` (Error con `statusCode`/
 * `details` adjuntos, ver apps/frontend/lib/api/client.ts) a un mensaje
 * diferenciado para el usuario, sin destruir ni mutar el objeto original.
 */

export type ApiErrorScope = 'task' | 'label' | 'assignment';

interface EnrichedError {
  statusCode?: number;
  message?: string;
}

export function getApiErrorMessage(error: unknown, scope: ApiErrorScope = 'task'): string {
  const enriched = error as EnrichedError | null | undefined;
  const statusCode = enriched?.statusCode;
  const backendMessage = enriched?.message;

  switch (statusCode) {
    case 400:
      return 'Revisa los datos ingresados y las relaciones seleccionadas.';
    case 403:
      return 'No tienes permisos para realizar esta acción.';
    case 404:
      return 'La tarea, etiqueta o proyecto ya no está disponible. Actualiza la información e inténtalo nuevamente.';
    case 409:
      if (scope === 'label') {
        return 'Ya existe una etiqueta con ese nombre.';
      }
      if (scope === 'assignment') {
        return 'La asignación cambió mientras realizabas la operación. Actualiza la tarea e inténtalo nuevamente.';
      }
      return backendMessage || 'Ocurrió un conflicto al procesar la solicitud.';
    default:
      return backendMessage || 'Ocurrió un error inesperado. Intenta nuevamente.';
  }
}
