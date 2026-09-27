/**
 * Lee JWT_SECRET sin valor por defecto (T-210). Firmar o verificar tokens de
 * acceso con un secreto conocido ('dev-secret-change-me', el que usaban los
 * 6 puntos que leían esta variable) permite forjar sesiones válidas si la
 * variable queda sin definir en el entorno: el arranque no falla y el fallo
 * de seguridad no es visible. Mismo patrón que JWT_REFRESH_SECRET
 * (auth.service.ts) y que getRequiredFrontendUrl (./frontend-url.ts).
 */
export function getRequiredJwtSecret(): string {
  return requireJwtSecret(process.env.JWT_SECRET);
}

/**
 * Misma regla que `getRequiredJwtSecret`, para los 4 `JwtModule.registerAsync`
 * (Auth/Admin/Notifications/Chat) que ya leen el entorno vía `ConfigService`
 * en vez de `process.env` directo (invariante cubierta por
 * `test/s7-environment.spec.ts` TC03-D: ningún consumidor lee el entorno
 * antes de `ConfigModule.forRoot`).
 */
export function requireJwtSecret(value: string | undefined | null): string {
  if (!value) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  return value;
}
