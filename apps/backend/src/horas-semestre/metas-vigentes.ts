import { semestreDe } from './semestre';

export interface MetasLegacy {
  horasBecaRequeridas?: number | null;
  horasExtensionRequeridas?: number | null;
}

export interface MetasVigentes {
  beca: number | null;
  extension: number | null;
}

/** Select anidado (desde Usuario) con el registro del semestre actual: no agrega consultas. */
export function selectRegistroActual(ahora = new Date()) {
  const { anio, periodo } = semestreDe(ahora);
  return {
    registrosHorasSemestre: {
      where: { anio, periodo },
      select: { metaBeca: true, metaExtension: true },
    },
  };
}

/** Meta del semestre actual (RegistroHorasSemestre); la del perfil (legacy) solo si no hay registro. */
export function resolverMetas(
  registros: { metaBeca: number | null; metaExtension: number | null }[] | null | undefined,
  legacy: MetasLegacy | null | undefined,
): MetasVigentes {
  const registro = registros?.[0];
  return registro
    ? { beca: registro.metaBeca, extension: registro.metaExtension }
    : { beca: legacy?.horasBecaRequeridas ?? null, extension: legacy?.horasExtensionRequeridas ?? null };
}
