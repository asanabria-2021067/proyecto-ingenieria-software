import type {
  AsociacionResumen,
  HorasSemestreHistorial,
  HorasCentralFiltros,
  RegistroHorasSemestre,
  Semestre,
  TotalesCarrera,
  TramoProgreso,
} from '@/lib/services/horas-semestre';

export type TipoHorasSemestre = 'beca' | 'extension';

export const ETIQUETA_TIPO: Record<TipoHorasSemestre, string> = {
  beca: 'horas beca',
  extension: 'horas de extensión',
};

export function etiquetaSemestre(s: Pick<Semestre, 'anio' | 'periodo'>): string {
  return `${s.periodo === 1 ? '1.er' : '2.º'} semestre ${s.anio}`;
}

/** YYYY-MM-DD -> dd/mm */
export function formatearDiaMes(dia: string): string {
  const [, mes, d] = dia.split('-');
  return `${d}/${mes}`;
}

/** Frase de proyección de un tramo; null si no hay meta ni ritmo para proyectar. `finSemestre` (YYYY-MM-DD): una fecha posterior no se promete. */
export function textoProyeccion(tipo: TipoHorasSemestre, tramo: TramoProgreso, finSemestre?: string): string | null {
  if (tramo.meta === null || tramo.meta <= 0) return null;
  if (tramo.avance >= tramo.meta) return `Ya completaste tus ${ETIQUETA_TIPO[tipo]} de este semestre`;
  if (!tramo.fechaProyectada) return `Registra horas para proyectar cuándo completas tus ${ETIQUETA_TIPO[tipo]}`;
  if (finSemestre && tramo.fechaProyectada > finSemestre) return 'A este ritmo no alcanzas la meta este semestre';
  return `A este ritmo completas tus ${ETIQUETA_TIPO[tipo]} el ${formatearDiaMes(tramo.fechaProyectada)}`;
}

/** Porcentaje de presentación de la barra (0-100). */
export function porcentajeAvance(avance: number, meta: number | null): number {
  if (meta === null || meta <= 0) return 0;
  return Math.min(100, Math.floor((avance / meta) * 100));
}

/** Campo numérico opcional del formulario: vacío -> undefined, entero 0-2000 -> número, otro -> NaN. */
export function parseHoras(valor: string): number | undefined {
  const texto = valor.trim();
  if (texto === '') return undefined;
  const n = Number(texto);
  return Number.isInteger(n) && n >= 0 && n <= 2000 ? n : NaN;
}

export interface HorasForm {
  metaBeca: string;
  becaDeclarada: string;
  metaExtension: string;
  extensionDeclarada: string;
}

export const HORAS_FORM_VACIO: HorasForm = { metaBeca: '', becaDeclarada: '', metaExtension: '', extensionDeclarada: '' };

const aTexto = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n));

/** Valores iniciales: el registro del semestre; si no existe, la meta que el perfil ya tenia. */
export function formDesdeRegistro(
  registro: RegistroHorasSemestre | null,
  perfil?: { horasBecaRequeridas?: number | null; horasExtensionRequeridas?: number | null },
): HorasForm {
  return {
    metaBeca: aTexto(registro ? registro.metaBeca : perfil?.horasBecaRequeridas),
    becaDeclarada: aTexto(registro?.becaDeclarada),
    metaExtension: aTexto(registro ? registro.metaExtension : perfil?.horasExtensionRequeridas),
    extensionDeclarada: aTexto(registro?.extensionDeclarada),
  };
}

/** Campos con valor invalido (no entero entre 0 y 2000). */
export function erroresForm(f: HorasForm): Partial<Record<keyof HorasForm, string>> {
  const errores: Partial<Record<keyof HorasForm, string>> = {};
  for (const campo of Object.keys(f) as (keyof HorasForm)[]) {
    if (Number.isNaN(parseHoras(f[campo]))) errores[campo] = 'Escribe un número entero entre 0 y 2000';
  }
  return errores;
}

/** Cuerpo del PUT: meta vacia = sin meta (null), declaradas vacias = 0. Asume un formulario sin errores. */
export function datosDeForm(f: HorasForm): RegistroHorasSemestre {
  return {
    metaBeca: parseHoras(f.metaBeca) ?? null,
    becaDeclarada: parseHoras(f.becaDeclarada) ?? 0,
    metaExtension: parseHoras(f.metaExtension) ?? null,
    extensionDeclarada: parseHoras(f.extensionDeclarada) ?? 0,
  };
}

export interface TotalesAsociacion extends Omit<TotalesCarrera, 'idCarrera' | 'carrera'> {
  clave: string;
  nombre: string;
}

const SUMAS = [
  'estudiantes',
  'enRiesgo',
  'metaBeca',
  'becaDeclarada',
  'becaAcreditada',
  'faltaBeca',
  'metaExtension',
  'extensionDeclarada',
  'extensionAcreditada',
  'faltaExtension',
] as const;

const vacio = (clave: string, nombre: string) =>
  ({ clave, nombre, ...Object.fromEntries(SUMAS.map((c) => [c, 0])) }) as TotalesAsociacion;

/**
 * Suma los totales por carrera dentro de cada asociacion activa que la representa.
 * Una carrera en varias asociaciones cuenta en cada una; la que no tiene asociacion va a «Sin asociación».
 */
export function totalesPorAsociacion(
  porCarrera: TotalesCarrera[],
  asociaciones: AsociacionResumen[],
): TotalesAsociacion[] {
  const grupos = new Map<string, TotalesAsociacion>();
  const sumar = (clave: string, nombre: string, fila: TotalesCarrera) => {
    const g = grupos.get(clave) ?? vacio(clave, nombre);
    for (const campo of SUMAS) g[campo] += fila[campo];
    grupos.set(clave, g);
  };
  for (const fila of porCarrera) {
    const dueñas = asociaciones.filter(
      (a) => !a.archivada && a.carreras.some((c) => c.carrera.idCarrera === fila.idCarrera),
    );
    if (dueñas.length === 0) sumar('sin', 'Sin asociación', fila);
    for (const a of dueñas) sumar(String(a.idAsociacion), a.nombre, fila);
  }
  return [...grupos.values()].sort((a, b) => (a.clave === 'sin' ? 1 : b.clave === 'sin' ? -1 : a.nombre.localeCompare(b.nombre, 'es')));
}

/** Los ultimos `cantidad` semestres terminando en el actual, el mas reciente primero. */
export function ultimosSemestres(actual: Pick<Semestre, 'anio' | 'periodo'>, cantidad = 6) {
  const lista: { anio: number; periodo: 1 | 2 }[] = [];
  let { anio, periodo } = actual;
  for (let i = 0; i < cantidad; i++) {
    lista.push({ anio, periodo });
    if (periodo === 1) {
      anio -= 1;
      periodo = 2;
    } else periodo = 1;
  }
  return lista;
}

export interface FilaComparacion {
  etiqueta: string;
  a: number;
  b: number;
  /** b - a: positivo = el segundo semestre tiene mas horas. */
  diferencia: number;
}

/** MEJ-61: declaradas, acreditadas y avance (su suma) de beca y extension en dos semestres. */
export function compararSemestres(a: HorasSemestreHistorial, b: HorasSemestreHistorial): FilaComparacion[] {
  const fila = (etiqueta: string, x: number, y: number): FilaComparacion => ({ etiqueta, a: x, b: y, diferencia: y - x });
  return (['beca', 'extension'] as const).flatMap((tipo) => {
    const nombre = tipo === 'beca' ? 'Beca' : 'Extensión';
    const [da, aa] = tipo === 'beca' ? [a.becaDeclarada, a.becaAcreditada] : [a.extensionDeclarada, a.extensionAcreditada];
    const [db, ab] = tipo === 'beca' ? [b.becaDeclarada, b.becaAcreditada] : [b.extensionDeclarada, b.extensionAcreditada];
    return [
      fila(`${nombre}: declaradas`, da, db),
      fila(`${nombre}: acreditadas`, aa, ab),
      fila(`${nombre}: avance`, da + aa, db + ab),
    ];
  });
}

export interface FiltrosUI {
  semestre: string;
  idCarrera: string;
  idAsociacion: string;
  enRiesgo: boolean;
}

/** Filtros del servidor a partir de los de pantalla. */
export function filtrosServidor(ui: FiltrosUI): HorasCentralFiltros {
  const filtros: HorasCentralFiltros = {};
  if (ui.semestre !== 'actual') {
    const [anio, periodo] = ui.semestre.split('-').map(Number);
    filtros.anio = anio;
    filtros.periodo = periodo as 1 | 2;
  }
  if (ui.enRiesgo) filtros.enRiesgo = true;
  if (ui.idCarrera) filtros.idCarrera = Number(ui.idCarrera);
  if (ui.idAsociacion) filtros.idAsociacion = Number(ui.idAsociacion);
  return filtros;
}

/** Regla de «en riesgo» en lenguaje llano (la calcula el servidor). */
export const AYUDA_EN_RIESGO =
  'En riesgo: el avance del semestre está más de 20 puntos por debajo de lo esperado según el tiempo transcurrido (a la mitad del semestre debe llevar 50 %; se marca si lleva menos de 30 %).';
