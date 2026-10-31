// NL-T2: reglas de la contraseña de registro. Deben coincidir con RegisterDto
// del backend (@MinLength / @MaxLength en apps/backend/src/auth/dto/register.dto.ts);
// test/contrasena-reglas.spec.ts compara ambos valores.
export const MIN_CONTRASENA = 8;
// bcrypt solo usa los primeros 72 bytes: más largo se truncaría en silencio.
export const MAX_CONTRASENA = 72;

export const REQUISITOS_CONTRASENA = [
  { id: 'min', texto: `Al menos ${MIN_CONTRASENA} caracteres`, cumple: (c: string) => c.length >= MIN_CONTRASENA },
  { id: 'max', texto: `No más de ${MAX_CONTRASENA} caracteres`, cumple: (c: string) => c.length > 0 && c.length <= MAX_CONTRASENA },
] as const;
