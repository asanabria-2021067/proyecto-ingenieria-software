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
 *
 * T-221: 401 (sesión vencida), validación de class-validator traducida por
 * campo, y fallback genérico para 5xx/red/mensajes técnicos: el usuario
 * nunca ve un código HTTP ni texto crudo del servidor.
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
  | 'admin'
  // T-221: pantallas fuera de un dominio concreto (perfil, postulaciones…);
  // en 400 muestran la validación traducida o el mensaje de dominio.
  | 'general'
  // T-221: login/registro/recuperación. Aquí un 401 significa credenciales o
  // token de recuperación inválidos, no sesión vencida.
  | 'auth';

interface EnrichedError {
  statusCode?: number;
  message?: string;
  code?: string;
  details?: unknown;
}

/**
 * T-221 — fallback para cualquier error no contemplado (5xx, red, mensajes
 * técnicos). Nunca se muestra un código HTTP ni el texto crudo del servidor.
 */
export const MENSAJE_ERROR_GENERICO =
  'Ocurrió un problema al realizar esta acción. Intenta nuevamente. Si el problema continúa, contacta al administrador.';

/** T-221 — 401 cuando el refresh silencioso de `apiFetch` ya no pudo renovar la sesión. */
export const MENSAJE_SESION_EXPIRADA = 'Tu sesión expiró. Inicia sesión nuevamente para continuar.';

/**
 * Mensajes que describen la falla técnica y no la situación del usuario:
 * textos por defecto de Nest/HTTP, errores de red del navegador, fallas de
 * Prisma/SQL o un código HTTP suelto. El error original sigue intacto en el
 * objeto; solo se evita mostrarlo.
 */
const MENSAJE_TECNICO =
  /internal server error|error del servidor|failed to fetch|networkerror|load failed|network request failed|unique constraint|foreign key|constraint failed|prisma|violates|ECONN|ETIMEDOUT|unexpected token|is not valid json|cannot read propert|is not a function|is not defined|is not iterable|maximum call stack|^\s*\d{3}\b|^\s*(bad request|unauthorized|forbidden|not found|conflict|unprocessable entity|too many requests|service unavailable|gateway timeout|bad gateway)\s*$/i;

function esMensajeTecnico(mensaje: string): boolean {
  return MENSAJE_TECNICO.test(mensaje);
}

function humanizarCampo(campo: string): string {
  return campo
    .split('.')
    .filter((parte) => !/^\d+$/.test(parte))
    .map((parte) => parte.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase())
    .join(' › ');
}

/**
 * Mensajes por defecto de class-validator (el `ValidationPipe` global del
 * backend no los personaliza en la mayoría de DTOs): `"<campo> <regla>"`.
 * Cada patrón recibe el campo ya humanizado y los grupos capturados.
 */
const REGLAS_VALIDACION: Array<[RegExp, (campo: string, m: RegExpMatchArray) => string]> = [
  [/^property (\S+) should not exist$/, (c) => `El campo «${c}» no está permitido.`],
  [/^(\S+) should not be empty$/, (c) => `El campo «${c}» es obligatorio.`],
  [/^(\S+) should not be null or undefined$/, (c) => `El campo «${c}» es obligatorio.`],
  [/^(\S+) must be longer than or equal to (\d+) characters?$/, (c, m) => `El campo «${c}» debe tener al menos ${m[2]} caracteres.`],
  [/^(\S+) must be shorter than or equal to (\d+) characters?$/, (c, m) => `El campo «${c}» no puede superar ${m[2]} caracteres.`],
  [/^(\S+) must not be less than (-?[\d.]+)$/, (c, m) => `El campo «${c}» debe ser mayor o igual a ${m[2]}.`],
  [/^(\S+) must not be greater than (-?[\d.]+)$/, (c, m) => `El campo «${c}» debe ser menor o igual a ${m[2]}.`],
  [/^(\S+) must be a positive number$/, (c) => `El campo «${c}» debe ser un número positivo.`],
  [/^(\S+) must be an integer number$/, (c) => `El campo «${c}» debe ser un número entero.`],
  [/^(\S+) must be a number/, (c) => `El campo «${c}» debe ser un número.`],
  [/^(\S+) must be a string$/, (c) => `El campo «${c}» debe ser un texto.`],
  [/^(\S+) must be a boolean value$/, (c) => `El campo «${c}» debe ser verdadero o falso.`],
  [/^(\S+) must be an email$/, (c) => `El campo «${c}» debe ser un correo electrónico válido.`],
  [/^(\S+) must be an array$/, (c) => `El campo «${c}» debe ser una lista.`],
  [/^(\S+) must contain (at least|no more than) (\d+) elements?$/, (c, m) => `El campo «${c}» debe tener ${m[2] === 'at least' ? 'al menos' : 'como máximo'} ${m[3]} elementos.`],
  [/^(\S+) must be one of the following values/, (c) => `El campo «${c}» tiene un valor no permitido.`],
  [/^(\S+) must be a valid enum value$/, (c) => `El campo «${c}» tiene un valor no permitido.`],
  [/^(\S+) must be a (valid ISO 8601 date string|Date instance)$/, (c) => `El campo «${c}» debe ser una fecha válida.`],
  [/^(\S+) must match .+ regular expression$/, (c) => `El campo «${c}» tiene un formato no válido.`],
  [/^(\S+) must be (a|an) /, (c) => `El campo «${c}» tiene un formato no válido.`],
];

/**
 * Traduce UN mensaje de class-validator a español legible, conservando el
 * campo que falló. Devuelve `null` si el texto no es de class-validator
 * (p. ej. un mensaje de dominio que el backend ya escribió en español).
 */
export function traducirMensajeValidacion(mensaje: string): string | null {
  const texto = mensaje.trim();
  for (const [patron, traducir] of REGLAS_VALIDACION) {
    const m = texto.match(patron);
    if (m) return traducir(humanizarCampo(m[1]), m);
  }
  return null;
}

/**
 * Detalle de validación del backend (`details` = `body.message`, string o
 * array) convertido a texto legible. `null` si nada parece class-validator.
 */
function traducirValidacion(error: unknown): string | null {
  const enriched = error as EnrichedError | null | undefined;
  const details = enriched?.details;
  const mensajes = Array.isArray(details)
    ? details.filter((d): d is string => typeof d === 'string')
    : typeof details === 'string'
      ? [details]
      : typeof enriched?.message === 'string'
        ? [enriched.message]
        : [];
  const traducidos = mensajes.map(traducirMensajeValidacion);
  if (traducidos.every((t) => t === null)) return null;
  // Mezcla de reglas traducidas y mensajes de dominio: los de dominio ya son
  // legibles y se conservan, salvo que sean técnicos.
  const legibles = traducidos.map((t, i) => t ?? (esMensajeTecnico(mensajes[i]) ? null : mensajes[i]));
  return [...new Set(legibles.filter((t): t is string => Boolean(t)))].join(' ');
}

/**
 * Mensaje del backend apto para el usuario: los de dominio vienen en
 * español y se conservan; los técnicos o de class-validator se descartan.
 */
function mensajeLegibleDelBackend(error: unknown): string | undefined {
  const message = (error as EnrichedError | null | undefined)?.message;
  if (typeof message !== 'string' || !message.trim()) return undefined;
  if (esMensajeTecnico(message) || traducirMensajeValidacion(message.split(', ')[0]) !== null) {
    return undefined;
  }
  return message;
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

/**
 * `fallback` reemplaza al mensaje genérico en errores no contemplados cuando
 * la pantalla tiene un contexto mejor («No fue posible cargar la bitácora…»).
 */
export function getApiErrorMessage(
  error: unknown,
  scope: ApiErrorScope = 'task',
  fallback: string = MENSAJE_ERROR_GENERICO,
): string {
  const statusCode = getApiErrorStatus(error);
  const backendMessage = mensajeLegibleDelBackend(error);

  switch (statusCode) {
    case 400: {
      // T-221: el detalle de class-validator se traduce por campo antes de
      // cualquier mensaje fijo, para que el usuario sepa qué corregir.
      const validacion = traducirValidacion(error);
      if (validacion) return validacion;
      if (scope === 'general' || scope === 'auth') {
        return backendMessage || 'Revisa los datos ingresados e inténtalo nuevamente.';
      }
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
    }
    case 401:
      if (scope === 'auth') {
        return backendMessage || 'No se pudo verificar tu identidad. Revisa los datos ingresados e inténtalo nuevamente.';
      }
      return MENSAJE_SESION_EXPIRADA;
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
      return 'No tienes permisos para realizar esta acción. Si crees que deberías tenerlos, contacta al líder del proyecto o a un administrador.';
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
      if (scope === 'general' || scope === 'auth') {
        return 'No encontramos lo que buscabas o ya no está disponible. Actualiza la información e inténtalo nuevamente.';
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
      // Sin `code` ni mensaje legible no se conoce la causa: no se inventa.
      return (
        backendMessage ||
        'No se pudo completar la acción porque la información cambió o ya no está disponible. Actualiza la información e inténtalo nuevamente.'
      );
    case 413:
      return getFileTooLargeMessage();
    case 422:
      if (scope === 'closure') {
        return 'El archivo no es un PDF válido o no pudo leerse.';
      }
      return (
        traducirValidacion(error) ||
        backendMessage ||
        'El contenido enviado no pudo procesarse. Revisa los datos e inténtalo nuevamente.'
      );
    case 503:
      if (scope === 'closure') {
        return 'El almacenamiento de documentos de cierre no está disponible en este momento. Inténtalo más tarde.';
      }
      return 'El servicio no está disponible en este momento. Inténtalo más tarde.';
    default:
      // 5xx: el texto del servidor nunca es para el usuario. Sin status (red,
      // error de cliente) solo se muestra si es legible; si no, el genérico.
      if (typeof statusCode === 'number' && statusCode >= 500) return fallback;
      return backendMessage || fallback;
  }
}
