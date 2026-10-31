// NL-T2: convierte el 400 de validación del backend (class-validator) en un
// mensaje por campo del formulario. Devuelve {} si no reconoce ningún campo,
// y entonces se usa el mensaje genérico.
export type CampoRegistro = 'nombre' | 'apellido' | 'carne' | 'correo' | 'contrasena' | 'idCarrera' | 'semestre';

const MENSAJE_POR_CAMPO: Record<CampoRegistro, string> = {
  nombre: 'Revisa tu nombre',
  apellido: 'Revisa tu apellido',
  carne: 'Revisa tu carnet',
  correo: 'Revisa tu correo institucional',
  contrasena: 'La contraseña debe tener entre 8 y 72 caracteres',
  idCarrera: 'Selecciona una carrera',
  semestre: 'El semestre es inválido',
};

export function erroresDeRegistro(error: { statusCode?: number; details?: unknown } | null): Partial<Record<CampoRegistro, string>> {
  if (error?.statusCode !== 400) return {};
  const mensajes = Array.isArray(error.details) ? error.details : [error.details];
  const resultado: Partial<Record<CampoRegistro, string>> = {};
  for (const mensaje of mensajes) {
    if (typeof mensaje !== 'string') continue;
    // class-validator antepone el nombre del campo: «contrasena must be longer…».
    const campo = (Object.keys(MENSAJE_POR_CAMPO) as CampoRegistro[]).find((c) => mensaje.startsWith(`${c} `));
    if (campo) {
      resultado[campo] ??= MENSAJE_POR_CAMPO[campo];
    } else if (mensaje.startsWith('El correo ')) {
      // Mensajes en español del propio backend: el correo no coincide con apellido y carné.
      resultado.correo ??= mensaje;
    }
  }
  return resultado;
}
