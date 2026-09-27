/**
 * Secreto JWT SINTÉTICO de las suites del backend (G01 · OWASP25-C019).
 * Cumple la longitud mínima que exige producción (>=32 caracteres), no es el
 * antiguo valor por defecto del código y no corresponde a ningún secreto real.
 */
export const SYNTHETIC_JWT_SECRET = 'synthetic-jwt-secret-for-backend-tests-0000';
