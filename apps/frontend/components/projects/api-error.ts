/**
 * Traduce el error enriquecido de `apiFetch` (Error con `statusCode`/
 * `details` adjuntos, ver apps/frontend/lib/api/client.ts) a un mensaje
 * diferenciado para el usuario, sin destruir ni mutar el objeto original.
 *
 * Sprint 7 (`10` §8): se añaden los scopes `hours | closure | leadership |
 * admin` y los estados 413 / 422 / 503, cada uno con tratamiento propio.
 * Los códigos de dominio (`PROYECTO_OCUPADO`, `REGISTRO_YA_REVOCADO`,
 * `CLOSURE_NO_CONFIGURADO`, …) se reconocen por `code` cuando viaja en el
 * error y, en su defecto, por el mensaje del backend.
 */

export type ApiErrorScope =
  | 'task'
  | 'label'
  | 'assignment'
  | 'role'
  | 'chat'
  | 'hours'
  | 'closure'
  | 'leadership'
  | 'admin';

interface EnrichedError {
  statusCode?: number;
  message?: string;
  code?: string;
  details?: unknown;
}

/** Límite contractual de un documento de cierre: 10 MiB exactos (`10` §5.3). */
export const CLOSURE_DOCUMENT_MAX_BYTES = 10_485_760;

export function getApiErrorStatus(error: unknown): number | undefined {
  return (error as EnrichedError | null | undefined)?.statusCode;
}

/**
 * Código de dominio del error, si el backend lo envió (`code` en el cuerpo).
 * `apiFetch` conserva `details` = `body.message`; algunos errores S7 llevan
 * el código dentro de un objeto `details`, por eso se buscan ambos.
 */
export function getApiErrorCode(error: unknown): string | undefined {
  const enriched = error as EnrichedError | null | undefined;
  if (!enriched) return undefined;
  if (typeof enriched.code === 'string') return enriched.code;
  const details = enriched.details;
  if (details && typeof details === 'object' && typeof (details as { code?: unknown }).code === 'string') {
    return (details as { code: string }).code;
  }
  return undefined;
}

function hasCode(error: unknown, code: string, fallbackPattern?: RegExp): boolean {
  if (getApiErrorCode(error) === code) return true;
  const message = (error as EnrichedError | null | undefined)?.message;
  return fallbackPattern != null && typeof message === 'string' && fallbackPattern.test(message);
}

/** 409 `REGISTRO_YA_REVOCADO`: revocar dos veces es idempotente, no un error. */
export function isRegistroYaRevocado(error: unknown): boolean {
  return getApiErrorStatus(error) === 409 && hasCode(error, 'REGISTRO_YA_REVOCADO', /ya estaba revocado/i);
}

/** 409 `PROYECTO_OCUPADO`: otra operación seria sobre el proyecto; reintentable con «Actualizar». */
export function isProyectoOcupado(error: unknown): boolean {
  return getApiErrorStatus(error) === 409 && hasCode(error, 'PROYECTO_OCUPADO', /ocupado/i);
}

/** 503 `CLOSURE_NO_CONFIGURADO`: storage/cierre no disponible; deshabilitar, no reintentar en bucle. */
export function isClosureNoConfigurado(error: unknown): boolean {
  return getApiErrorStatus(error) === 503;
}

function formatMiB(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(bytes % 1_048_576 === 0 ? 0 : 1)} MiB`;
}

/** Mensaje explícito de 413 con el límite en MiB y, si se conoce, el tamaño real del archivo. */
export function getFileTooLargeMessage(actualBytes?: number): string {
  const limite = formatMiB(CLOSURE_DOCUMENT_MAX_BYTES);
  if (typeof actualBytes === 'number' && Number.isFinite(actualBytes)) {
    return `El archivo pesa ${formatMiB(actualBytes)} y supera el límite de ${limite}.`;
  }
  return `El archivo supera el límite de ${limite}.`;
}

export function getApiErrorMessage(error: unknown, scope: ApiErrorScope = 'task'): string {
  const enriched = error as EnrichedError | null | undefined;
  const statusCode = enriched?.statusCode;
  const backendMessage = enriched?.message;

  switch (statusCode) {
    case 400:
      // Las reglas de negocio de roles (cupo lleno, último rol, rol utilizado…)
      // y de chat (participante sin participación activa, conteo inválido…)
      // devuelven un mensaje funcional específico que conviene mostrar tal cual.
      // Los scopes S7 también: el backend explica exactamente qué campo falla
      // (p. ej. «se requiere justificacionExceso»).
      if (
        scope === 'role' ||
        scope === 'chat' ||
        scope === 'hours' ||
        scope === 'closure' ||
        scope === 'leadership' ||
        scope === 'admin'
      ) {
        return backendMessage || 'Revisa los datos ingresados y las relaciones seleccionadas.';
      }
      return 'Revisa los datos ingresados y las relaciones seleccionadas.';
    case 403:
      if (scope === 'hours') {
        return 'Ya no puedes modificar las horas de esta tarea.';
      }
      if (scope === 'closure') {
        return 'Ya no tienes acceso a esta operación de cierre.';
      }
      if (scope === 'leadership') {
        return 'El liderazgo del proyecto cambió; ya no puedes realizar esta acción.';
      }
      if (scope === 'admin') {
        return 'Esta acción requiere permisos de administrador.';
      }
      return 'No tienes permisos para realizar esta acción.';
    case 404:
      if (scope === 'hours') {
        return 'El registro de horas ya no existe. Actualiza la información.';
      }
      if (scope === 'closure') {
        return 'El documento o la revisión de cierre ya no están disponibles.';
      }
      if (scope === 'leadership' || scope === 'admin') {
        return 'El recurso ya no está disponible. Actualiza la información.';
      }
      return 'La tarea, etiqueta o proyecto ya no está disponible. Actualiza la información e inténtalo nuevamente.';
    case 409:
      if (scope === 'label') {
        return 'Ya existe una etiqueta con ese nombre.';
      }
      if (scope === 'assignment') {
        return 'La asignación cambió mientras realizabas la operación. Actualiza la tarea e inténtalo nuevamente.';
      }
      if (scope === 'hours') {
        if (isRegistroYaRevocado(error)) {
          return 'Este registro ya había sido revocado.';
        }
        return backendMessage || 'Las horas cambiaron mientras trabajabas. Actualiza e inténtalo de nuevo.';
      }
      if (scope === 'closure') {
        if (isProyectoOcupado(error)) {
          return 'El proyecto está ocupado por otra operación. Actualiza e inténtalo de nuevo.';
        }
        return backendMessage || 'La entrega cambió mientras trabajabas. Actualiza para ver el estado actual.';
      }
      if (scope === 'leadership') {
        return backendMessage || 'El liderazgo cambió mientras trabajabas. Actualiza para ver el estado actual.';
      }
      if (scope === 'admin') {
        return backendMessage || 'Otro administrador resolvió esto mientras trabajabas. Actualiza para ver el estado actual.';
      }
      return backendMessage || 'Ocurrió un conflicto al procesar la solicitud.';
    case 413:
      return getFileTooLargeMessage();
    case 422:
      if (scope === 'closure') {
        return 'El archivo no es un PDF válido o no pudo leerse.';
      }
      return backendMessage || 'El contenido enviado no pudo procesarse.';
    case 503:
      if (scope === 'closure') {
        return 'El almacenamiento de documentos de cierre no está disponible en este momento. Inténtalo más tarde.';
      }
      return 'El servicio no está disponible en este momento. Inténtalo más tarde.';
    default:
      return backendMessage || 'Ocurrió un error inesperado. Intenta nuevamente.';
  }
}
