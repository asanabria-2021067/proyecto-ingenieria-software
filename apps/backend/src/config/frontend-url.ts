/**
 * Lee y valida FRONTEND_URL: exige una URL absoluta http/https, no vacía y
 * distinta de '*'. Se usa para configurar orígenes CORS sin permitir un
 * origen abierto ni un arranque silencioso con un valor ausente.
 */
export function getRequiredFrontendUrl(): string {
  const value = process.env.FRONTEND_URL?.trim();

  if (!value) {
    throw new Error('FRONTEND_URL environment variable is required');
  }

  if (value === '*') {
    throw new Error('FRONTEND_URL cannot allow every origin');
  }

  const parsedUrl = new URL(value);

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error('FRONTEND_URL must use http or https');
  }

  return value;
}
