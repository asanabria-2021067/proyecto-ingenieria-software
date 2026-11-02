// Borradores de formularios en localStorage. Todo va en try/catch: el modo
// privado o el almacenamiento lleno no deben romper el formulario.
const PREFIJO = 'uvg-borrador:';
const VIGENCIA_MS = 7 * 24 * 60 * 60 * 1000;

export interface Borrador<T> {
  valor: T;
  guardadoEn: number;
}

export function leerBorrador<T>(clave: string, ahora = Date.now()): Borrador<T> | null {
  try {
    const crudo = localStorage.getItem(PREFIJO + clave);
    if (!crudo) return null;
    const dato = JSON.parse(crudo) as Borrador<T>;
    if (typeof dato?.guardadoEn !== 'number' || ahora - dato.guardadoEn > VIGENCIA_MS) {
      localStorage.removeItem(PREFIJO + clave);
      return null;
    }
    return dato;
  } catch {
    return null;
  }
}

export function guardarBorrador<T>(clave: string, valor: T, ahora = Date.now()): void {
  try {
    localStorage.setItem(PREFIJO + clave, JSON.stringify({ valor, guardadoEn: ahora }));
  } catch {
    // Sin espacio o sin acceso: el formulario sigue funcionando sin borrador.
  }
}

export function descartarBorrador(clave: string): void {
  try {
    localStorage.removeItem(PREFIJO + clave);
  } catch {
    // Nada que descartar.
  }
}

/** Al cerrar sesión: otra cuenta en el mismo navegador no hereda borradores. */
export function descartarTodosLosBorradores(): void {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIJO)) localStorage.removeItem(k);
  } catch {
    // Nada que descartar.
  }
}
