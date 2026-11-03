import type { FilaHorasCentral, TipoHoras } from './horas-semestre.service';

type FilaOrdenable = Pick<
  FilaHorasCentral,
  'idUsuario' | 'enRiesgo' | 'metaBeca' | 'becaDeclarada' | 'becaAcreditada' | 'metaExtension' | 'extensionDeclarada' | 'extensionAcreditada'
>;

/** Avance (0..n) sobre las metas registradas del tipo consultado, o null si no hay ninguna meta (> 0). */
export function avanceSobreMetas(f: FilaOrdenable, tipo?: TipoHoras): number | null {
  let meta = 0;
  let avance = 0;
  if (tipo !== 'EXTENSION' && f.metaBeca) {
    meta += f.metaBeca;
    avance += f.becaDeclarada + f.becaAcreditada;
  }
  if (tipo !== 'BECA' && f.metaExtension) {
    meta += f.metaExtension;
    avance += f.extensionDeclarada + f.extensionAcreditada;
  }
  return meta > 0 ? avance / meta : null;
}

/**
 * Orden de estudiantes: 1) en riesgo, 2) con metas de menor a mayor avance, 3) sin metas al final.
 * Desempata por idUsuario, asi el orden es total y estable entre paginas.
 */
export const compararEstudiantes =
  (tipo?: TipoHoras) =>
  (a: FilaOrdenable, b: FilaOrdenable): number => {
    const pa = avanceSobreMetas(a, tipo);
    const pb = avanceSobreMetas(b, tipo);
    const grupo = (f: FilaOrdenable, p: number | null) => (f.enRiesgo ? 0 : p === null ? 2 : 1);
    return grupo(a, pa) - grupo(b, pb) || (pa ?? 0) - (pb ?? 0) || a.idUsuario - b.idUsuario;
  };
