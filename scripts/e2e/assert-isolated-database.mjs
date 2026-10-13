#!/usr/bin/env node
// GPI01-C12: comprobacion independiente de que una URL de PostgreSQL es la
// base desechable de la pila E2E aislada. Falla cerrado: cualquier duda aborta.
// Uso: assert-isolated-database.mjs <url> <puerto-esperado> <base-esperada>

/** Puertos donde vive (o ha vivido) una base con datos reales en este proyecto. */
export const PROTECTED_PORTS = ['5432', '5433', '5456'];
const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost'];
const ISOLATED_NAME = /^uvg_e2e_isolated(_[a-z0-9]+)?$/;

/** Devuelve la lista de motivos por los que la URL NO es la base aislada (vacia = aceptada). */
export function isolatedDatabaseProblems(rawUrl, expectedPort, expectedName) {
  let url;
  try {
    url = new URL(rawUrl ?? '');
  } catch {
    return ['la URL no es valida'];
  }
  const problems = [];
  const name = url.pathname.replace(/^\//, '');
  if (!/^postgres(ql)?:$/.test(url.protocol)) problems.push('el protocolo no es postgresql');
  if (!LOOPBACK_HOSTS.includes(url.hostname)) problems.push('el host no es loopback');
  if (!url.port) problems.push('la URL no declara puerto');
  if (PROTECTED_PORTS.includes(url.port)) problems.push('el puerto pertenece a una base persistente');
  if (!expectedPort || url.port !== String(expectedPort)) problems.push('el puerto no es el de la pila aislada');
  if (!ISOLATED_NAME.test(name)) problems.push('el nombre de la base no es el de la pila aislada');
  if (!expectedName || name !== expectedName) problems.push('el nombre de la base no coincide con el esperado');
  return problems;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [, , rawUrl, expectedPort, expectedName] = process.argv;
  const problems = isolatedDatabaseProblems(rawUrl, expectedPort, expectedName);
  if (problems.length > 0) {
    // Nunca se imprime la URL: puede llevar credenciales.
    console.error(`assert-isolated-database: rechazada: ${problems.join('; ')}`);
    process.exit(1);
  }
}
