// MEJ-78: ultima pagina interna que visito la persona, para «Continúa donde te quedaste» en el dashboard.
// Solo localStorage: es una comodidad por navegador, nunca estado que otros deban ver.
const CLAVE = 'uvg-ultima-vista';

export interface UltimaVista {
  idUsuario: number;
  href: string;
  etiqueta: string;
}

export function guardarUltimaVista(vista: UltimaVista): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(vista));
  } catch {}
}

/** Valor crudo (string estable) para `useSyncExternalStore`. */
export function leerUltimaVistaCruda(): string | null {
  try {
    return localStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}

export function suscribirUltimaVista(avisar: () => void): () => void {
  window.addEventListener('storage', avisar);
  return () => window.removeEventListener('storage', avisar);
}

/** La vista guardada solo vale para el mismo usuario y para una ruta interna. */
export function parsearUltimaVista(cruda: string | null, idUsuario: number | undefined): UltimaVista | null {
  if (!cruda || idUsuario === undefined) return null;
  try {
    const v = JSON.parse(cruda) as Partial<UltimaVista>;
    const valida =
      v.idUsuario === idUsuario &&
      typeof v.href === 'string' &&
      /^\/dashboard\/[^/]/.test(v.href) &&
      typeof v.etiqueta === 'string' &&
      v.etiqueta.length > 0;
    return valida ? (v as UltimaVista) : null;
  } catch {
    return null;
  }
}
