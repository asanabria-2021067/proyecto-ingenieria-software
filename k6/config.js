// K1 — configuración centralizada reutilizable por los escenarios de carga
// (K2/K3). Toda variable de entorno se lee vía `__ENV`, la API real de k6
// para pasar valores con `-e NOMBRE=valor` — k6 no ejecuta estos scripts en
// un runtime Node, así que `process.env` no existe aquí y no debe usarse.
//
// Uso esperado por un escenario:
//   k6 run \
//     -e K6_BASE_URL=http://localhost:3001 \
//     -e K6_USER_EMAIL=... \
//     -e K6_USER_PASSWORD=... \
//     k6/scenarios/<algo>.js

const DEFAULT_LOCAL_BASE_URL = 'http://localhost:3001';

/**
 * Lee una variable de entorno obligatoria y falla explícitamente si falta,
 * en vez de dejar que un escenario arme requests contra "undefined/...".
 */
export function requireEnv(name) {
  const value = __ENV[name];
  if (!value) {
    throw new Error(`${name} is required (pass it with: k6 run -e ${name}=<valor> ...)`);
  }
  return value;
}

/** Quita las barras finales para evitar URLs con "//" al concatenar rutas. */
export function normalizeBaseUrl(url) {
  return url.replace(/\/+$/, '');
}

function resolveHostBaseUrl() {
  // K6_BASE_URL es la única variable soportada para el host — sin ella se
  // usa el puerto real de desarrollo del backend (apps/backend, PORT=3001,
  // ver docker-compose.yml/.env.example), nunca una URL de producción.
  const raw = __ENV.K6_BASE_URL || DEFAULT_LOCAL_BASE_URL;
  return normalizeBaseUrl(raw);
}

/**
 * Backend real: apps/backend/src/main.ts fija `app.setGlobalPrefix('api')`
 * — `baseUrl` ya incluye ese prefijo para que cada escenario solo
 * concatene la ruta del recurso (p. ej. `${config.baseUrl}/proyectos`),
 * sin que cada uno tenga que recordar el prefijo por su cuenta.
 */
export const config = {
  baseUrl: `${resolveHostBaseUrl()}/api`,
};

/**
 * Credenciales de la cuenta k6 (usuario real de prueba, nunca hardcodeado
 * aquí): K6_USER_EMAIL/K6_USER_PASSWORD, obligatorias solo en el momento en
 * que un escenario realmente necesita autenticarse (vía helpers/auth.js),
 * no al cargar este módulo — así un escenario que no llame a `login()`
 * nunca falla por variables de credenciales ausentes.
 */
export function getCredentials() {
  return {
    email: requireEnv('K6_USER_EMAIL'),
    password: requireEnv('K6_USER_PASSWORD'),
  };
}
