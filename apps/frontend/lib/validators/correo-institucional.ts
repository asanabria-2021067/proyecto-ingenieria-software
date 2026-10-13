const DOMINIO_CORREO_INSTITUCIONAL = 'uvg.edu.gt';
const LETRAS_PREFIJO_APELLIDO = 3;

export const FORMATO_CORREO_INSTITUCIONAL = /^[a-z]{2,3}\d+@uvg\.edu\.gt$/;

export function prefijoApellido(apellido: string): string {
  return apellido
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .slice(0, LETRAS_PREFIJO_APELLIDO);
}

export function correoInstitucionalEsperado(apellido: string, carne: string): string {
  return `${prefijoApellido(apellido)}${carne.trim()}@${DOMINIO_CORREO_INSTITUCIONAL}`;
}
