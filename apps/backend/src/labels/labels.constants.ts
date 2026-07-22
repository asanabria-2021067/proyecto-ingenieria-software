/**
 * Formato estricto `#RRGGBB`: exactamente un `#` seguido de 6 dígitos
 * hexadecimales (mayúscula o minúscula). Rechaza formas cortas (`#FFF`),
 * de 8 caracteres (con alfa), sin `#`, y espacios externos (sin trim
 * implícito: `RegExp.test` no ignora espacios al inicio/fin).
 */
export const LABEL_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;
