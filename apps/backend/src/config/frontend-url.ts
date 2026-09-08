import { assertFrontendUrl } from './environment.validation';

/**
 * Lee y valida FRONTEND_URL: exige una URL absoluta http/https, no vacía y
 * distinta de '*'. Se usa para configurar orígenes CORS sin permitir un
 * origen abierto ni un arranque silencioso con un valor ausente. Consume el
 * entorno ya cargado por la foundation única (ConfigModule asigna el archivo
 * autoritativo a process.env antes de que arranque cualquier consumidor) y
 * aplica la misma regla y mensajes que el validador central.
 */
export function getRequiredFrontendUrl(): string {
  return assertFrontendUrl(process.env.FRONTEND_URL);
}
