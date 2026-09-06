import { createHash } from 'node:crypto';

/**
 * C109/C110 (06 v2 §28/§35/§40/§46): modelo canónico del informe de cierre y su
 * serialización determinista.
 *
 * Helper PURO: no importa Nest ni Prisma y no consulta nada. Recibe datos ya
 * leídos bajo el lock de la transacción de captura y devuelve una proyección
 * explícita. Esa pureza es lo que permite que el mismo modelo se use para
 * calcular una huella y para renderizar, sin que ninguna de las dos vuelva a
 * tocar la base.
 *
 * La canonicalización existe para que dos servidores —con distinta zona
 * horaria, distinto locale y datos llegando en distinto orden— produzcan
 * exactamente los mismos bytes. Un informe cuya huella dependiera del entorno
 * no serviría para detectar que la ejecución cambió.
 */

export const CLOSURE_REPORT_MODEL_SCHEMA = 'closure-report-model-v1' as const;

/** Valores que el caller puede entregar para un importe; nunca `undefined`. */
export type DecimalLike = string | number;
export type InstantLike = Date | string;

export interface ClosureProjectInput {
  idProyecto: number;
  tituloProyecto: string;
  descripcionProyecto: string | null;
  objetivos: string | null;
  tipoProyecto: string;
  modalidad: string | null;
  ubicacion: string | null;
  contexto: string | null;
  recursoExterno: string | null;
  fechaInicio: InstantLike | null;
  fechaFin: InstantLike | null;
  estadoProyecto: string;
}

export interface ClosureUserInput {
  idUsuario: number;
  nombre: string;
  apellido: string;
}

export interface ClosureLeadershipInput {
  idHistorialLiderazgo: number;
  idLiderAnterior: number;
  idLiderNuevo: number;
  idAdminResponsable: number;
  origen: string;
  motivo: string;
  registradoEn: InstantLike;
  idApelacion: number | null;
}

export interface ClosureSprintInput {
  idSprint: number;
  numero: number;
  fechaInicio: InstantLike | null;
  fechaFin: InstantLike | null;
}

export interface ClosureMilestoneInput {
  idHito: number;
  tituloHito: string;
  estadoHito: string;
  fechaLimite: InstantLike | null;
  orden: number;
}

export interface ClosureTimeRecordInput {
  idRegistroTiempo: number;
  horas: DecimalLike;
  fecha: InstantLike;
  nota: string | null;
  justificacionExceso: string | null;
  revocadoEn: InstantLike | null;
}

export interface ClosureAdjustmentInput {
  idAjusteHora: number;
  deltaHoras: DecimalLike;
  horasBase: DecimalLike;
  justificacion: string | null;
  anuladoEn: InstantLike | null;
}

export interface ClosureTramoInput {
  idAsignacion: number;
  idUsuario: number;
  idParticipacion: number | null;
  origenReporte: string;
  horasReportadas: DecimalLike;
  reconocidoEn: InstantLike | null;
  registros: ClosureTimeRecordInput[];
  ajustes: ClosureAdjustmentInput[];
}

export interface ClosureTaskInput {
  idTarea: number;
  tituloTarea: string;
  idSprint: number;
  idRolProyecto: number | null;
  estadoTarea: string;
  eliminada: boolean;
  estimacionHoras: DecimalLike | null;
  tramos: ClosureTramoInput[];
}

export interface ClosureParticipationInput {
  idParticipacion: number;
  idUsuario: number;
  idRolProyecto: number;
  nombreRol: string;
  estadoParticipacion: string;
  fechaIngreso: InstantLike;
  fechaSalida: InstantLike | null;
}

export interface ClosureProposalInput {
  idParticipacion: number;
  idUsuario: number;
  horasReportadas: DecimalLike;
  horasLegacy: DecimalLike;
  horasPropuestas: DecimalLike;
}

export interface ClosureExecutionInput {
  proyecto: ClosureProjectInput;
  lider: ClosureUserInput;
  liderazgo: ClosureLeadershipInput[];
  sprintsCerrados: ClosureSprintInput[];
  hitos: ClosureMilestoneInput[];
  tareas: ClosureTaskInput[];
  participaciones: ClosureParticipationInput[];
  propuestasPorParticipante: ClosureProposalInput[];
  totales: {
    horasReportadas: DecimalLike;
    horasLegacy: DecimalLike;
    horasPropuestas: DecimalLike;
    tareasDistintas: number;
  };
}

/** Proyección canónica; su forma es el contrato, no un detalle de render. */
export interface ClosureReportModelV1 {
  schema: typeof CLOSURE_REPORT_MODEL_SCHEMA;
  proyecto: Record<string, unknown>;
  lider: Record<string, unknown>;
  liderazgo: Array<Record<string, unknown>>;
  sprintsCerrados: Array<Record<string, unknown>>;
  hitos: Array<Record<string, unknown>>;
  tareas: Array<Record<string, unknown>>;
  participaciones: Array<Record<string, unknown>>;
  propuestasPorParticipante: Array<Record<string, unknown>>;
  totales: Record<string, unknown>;
}

export class ClosureCanonicalizationError extends Error {}

/** El texto se normaliza a NFC: «á» compuesta y descompuesta son el mismo dato. */
function texto(value: string | null, campo: string): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new ClosureCanonicalizationError(`${campo} debe ser texto o null`);
  }
  return value.normalize('NFC');
}

/**
 * Importes como string de DOS posiciones. Aceptar `3.5`, `3.50` y `"3.500"`
 * y emitir siempre `"3.50"` impide que la representación con la que llegó el
 * dato cambie la huella del informe.
 */
export function decimal2(value: DecimalLike | null, campo: string): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new ClosureCanonicalizationError(`${campo} debe ser un importe decimal`);
  }
  const numero = typeof value === 'number' ? value : Number(value.trim());
  if (!Number.isFinite(numero)) {
    throw new ClosureCanonicalizationError(`${campo} no es un importe válido`);
  }
  return numero.toFixed(2);
}

/** Instante en ISO UTC. Nunca se usan los getters locales del proceso. */
export function instanteUtc(value: InstantLike | null, campo: string): string | null {
  if (value === null) {
    return null;
  }
  const fecha = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(fecha.getTime())) {
    throw new ClosureCanonicalizationError(`${campo} no es una fecha válida`);
  }
  return fecha.toISOString();
}

/** Fecha de calendario `YYYY-MM-DD` derivada de los componentes UTC. */
export function fechaUtc(value: InstantLike | null, campo: string): string | null {
  const iso = instanteUtc(value, campo);
  return iso === null ? null : iso.slice(0, 10);
}

/** Orden por identificador numérico; jamás por un nombre que una traducción pueda mover. */
function porId<T>(filas: readonly T[], id: (fila: T) => number): T[] {
  return [...filas].sort((a, b) => id(a) - id(b));
}

export function projectClosureModel(input: ClosureExecutionInput): ClosureReportModelV1 {
  const proyecto = input.proyecto;
  return {
    schema: CLOSURE_REPORT_MODEL_SCHEMA,
    proyecto: {
      idProyecto: proyecto.idProyecto,
      tituloProyecto: texto(proyecto.tituloProyecto, 'tituloProyecto'),
      descripcionProyecto: texto(proyecto.descripcionProyecto, 'descripcionProyecto'),
      objetivos: texto(proyecto.objetivos, 'objetivos'),
      tipoProyecto: texto(proyecto.tipoProyecto, 'tipoProyecto'),
      modalidad: texto(proyecto.modalidad, 'modalidad'),
      ubicacion: texto(proyecto.ubicacion, 'ubicacion'),
      contexto: texto(proyecto.contexto, 'contexto'),
      recursoExterno: texto(proyecto.recursoExterno, 'recursoExterno'),
      fechaInicio: fechaUtc(proyecto.fechaInicio, 'fechaInicio'),
      fechaFin: fechaUtc(proyecto.fechaFin, 'fechaFin'),
      estadoProyecto: texto(proyecto.estadoProyecto, 'estadoProyecto'),
    },
    lider: {
      idUsuario: input.lider.idUsuario,
      nombre: texto(input.lider.nombre, 'lider.nombre'),
      apellido: texto(input.lider.apellido, 'lider.apellido'),
    },
    liderazgo: porId(input.liderazgo, (fila) => fila.idHistorialLiderazgo).map((fila) => ({
      idHistorialLiderazgo: fila.idHistorialLiderazgo,
      idLiderAnterior: fila.idLiderAnterior,
      idLiderNuevo: fila.idLiderNuevo,
      idAdminResponsable: fila.idAdminResponsable,
      origen: texto(fila.origen, 'liderazgo.origen'),
      motivo: texto(fila.motivo, 'liderazgo.motivo'),
      registradoEn: instanteUtc(fila.registradoEn, 'liderazgo.registradoEn'),
      idApelacion: fila.idApelacion,
    })),
    // Los Sprints se ordenan por número y, a igualdad, por identificador.
    sprintsCerrados: [...input.sprintsCerrados]
      .sort((a, b) => (a.numero === b.numero ? a.idSprint - b.idSprint : a.numero - b.numero))
      .map((sprint) => ({
        idSprint: sprint.idSprint,
        numero: sprint.numero,
        fechaInicio: fechaUtc(sprint.fechaInicio, 'sprint.fechaInicio'),
        fechaFin: fechaUtc(sprint.fechaFin, 'sprint.fechaFin'),
      })),
    hitos: porId(input.hitos, (hito) => hito.idHito).map((hito) => ({
      idHito: hito.idHito,
      tituloHito: texto(hito.tituloHito, 'hito.tituloHito'),
      estadoHito: texto(hito.estadoHito, 'hito.estadoHito'),
      fechaLimite: fechaUtc(hito.fechaLimite, 'hito.fechaLimite'),
      orden: hito.orden,
    })),
    // Las tareas eliminadas viajan igual que las vivas: su contribución no
    // desaparece del informe por haberse borrado del tablero.
    tareas: porId(input.tareas, (tarea) => tarea.idTarea).map((tarea) => ({
      idTarea: tarea.idTarea,
      tituloTarea: texto(tarea.tituloTarea, 'tarea.tituloTarea'),
      idSprint: tarea.idSprint,
      idRolProyecto: tarea.idRolProyecto,
      estadoTarea: texto(tarea.estadoTarea, 'tarea.estadoTarea'),
      eliminada: tarea.eliminada,
      estimacionHoras: decimal2(tarea.estimacionHoras, 'tarea.estimacionHoras'),
      tramos: porId(tarea.tramos, (tramo) => tramo.idAsignacion).map((tramo) => ({
        idAsignacion: tramo.idAsignacion,
        idUsuario: tramo.idUsuario,
        idParticipacion: tramo.idParticipacion,
        origenReporte: texto(tramo.origenReporte, 'tramo.origenReporte'),
        horasReportadas: decimal2(tramo.horasReportadas, 'tramo.horasReportadas'),
        reconocidoEn: instanteUtc(tramo.reconocidoEn, 'tramo.reconocidoEn'),
        registros: porId(tramo.registros, (registro) => registro.idRegistroTiempo).map((registro) => ({
          idRegistroTiempo: registro.idRegistroTiempo,
          horas: decimal2(registro.horas, 'registro.horas'),
          fecha: fechaUtc(registro.fecha, 'registro.fecha'),
          nota: texto(registro.nota, 'registro.nota'),
          justificacionExceso: texto(registro.justificacionExceso, 'registro.justificacionExceso'),
          revocadoEn: instanteUtc(registro.revocadoEn, 'registro.revocadoEn'),
        })),
        ajustes: porId(tramo.ajustes, (ajuste) => ajuste.idAjusteHora).map((ajuste) => ({
          idAjusteHora: ajuste.idAjusteHora,
          deltaHoras: decimal2(ajuste.deltaHoras, 'ajuste.deltaHoras'),
          horasBase: decimal2(ajuste.horasBase, 'ajuste.horasBase'),
          justificacion: texto(ajuste.justificacion, 'ajuste.justificacion'),
          anuladoEn: instanteUtc(ajuste.anuladoEn, 'ajuste.anuladoEn'),
        })),
      })),
    })),
    participaciones: porId(input.participaciones, (fila) => fila.idParticipacion).map((fila) => ({
      idParticipacion: fila.idParticipacion,
      idUsuario: fila.idUsuario,
      idRolProyecto: fila.idRolProyecto,
      nombreRol: texto(fila.nombreRol, 'participacion.nombreRol'),
      estadoParticipacion: texto(fila.estadoParticipacion, 'participacion.estadoParticipacion'),
      fechaIngreso: instanteUtc(fila.fechaIngreso, 'participacion.fechaIngreso'),
      fechaSalida: instanteUtc(fila.fechaSalida, 'participacion.fechaSalida'),
    })),
    propuestasPorParticipante: porId(
      input.propuestasPorParticipante,
      (fila) => fila.idParticipacion,
    ).map((fila) => ({
      idParticipacion: fila.idParticipacion,
      idUsuario: fila.idUsuario,
      horasReportadas: decimal2(fila.horasReportadas, 'propuesta.horasReportadas'),
      horasLegacy: decimal2(fila.horasLegacy, 'propuesta.horasLegacy'),
      horasPropuestas: decimal2(fila.horasPropuestas, 'propuesta.horasPropuestas'),
    })),
    totales: {
      horasReportadas: decimal2(input.totales.horasReportadas, 'totales.horasReportadas'),
      horasLegacy: decimal2(input.totales.horasLegacy, 'totales.horasLegacy'),
      horasPropuestas: decimal2(input.totales.horasPropuestas, 'totales.horasPropuestas'),
      tareasDistintas: input.totales.tareasDistintas,
    },
  };
}

/**
 * Serialización canónica: claves lexicográficas RECURSIVAS y sin espacios.
 *
 * `undefined` está prohibido en cualquier profundidad. `JSON.stringify` lo
 * omitiría en silencio y dos entradas distintas producirían el mismo hash,
 * que es exactamente el fallo que esta función existe para impedir.
 */
export function canonicalJson(value: unknown, ruta = '$'): string {
  if (value === undefined) {
    throw new ClosureCanonicalizationError(
      `${ruta} es undefined; el modelo canónico exige null explícito`,
    );
  }
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return JSON.stringify(value.normalize('NFC'));
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new ClosureCanonicalizationError(`${ruta} no es un número finito`);
    }
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }
  if (Array.isArray(value)) {
    return `[${value.map((item, indice) => canonicalJson(item, `${ruta}[${indice}]`)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entradas = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    const cuerpo = entradas
      .map(([clave, valor]) => `${JSON.stringify(clave)}:${canonicalJson(valor, `${ruta}.${clave}`)}`)
      .join(',');
    return `{${cuerpo}}`;
  }
  throw new ClosureCanonicalizationError(`${ruta} tiene un tipo no serializable`);
}

/** SHA-256 hexadecimal en minúsculas sobre el JSON canónico. */
export function canonicalDigest(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}


// ─────────────────────── C110: huellas y presentación ───────────────────────

export const CLOSURE_EXECUTION_SCHEMA = 'closure-execution-v1' as const;
export const CLOSURE_MODEL_SCHEMA = 'closure-model-v1' as const;

export type ClosureReportVariant = 'AUTOMATICO' | 'OFICIAL';

/**
 * Metadata de presentación ESTRECHA (§28): solo los nombres externos que ese
 * informe concreto muestra —usuarios y catálogos globales—, capturados una
 * sola vez en la lectura coherente y almacenados junto al documento.
 *
 * Existe para que editar un perfil fuera del lock del proyecto no altere una
 * entrega ya enviada. NO es un snapshot del proyecto ni contiene datos
 * operativos: los nombres de rol y de tarea son del proyecto y viajan en la
 * ejecución, donde sí deben detectarse sus cambios.
 */
export interface ClosurePresentation {
  usuarios: Array<{ id: number; nombre: string }>;
  catalogos: Array<{ tipo: string; id: number; nombre: string }>;
}

/**
 * Ruido que la huella de ejecución RECIBE y DESCARTA (§28).
 *
 * Se declara explícitamente en lugar de omitirse para que la exclusión sea
 * legible: cada campo aquí es algo que cambia por el propio pipeline de
 * cierre y que, si entrara en la huella, volvería obsoleto un informe por
 * haberlo generado.
 */
export interface ClosureExcludedAmbient {
  /** E→S es estado transitorio del propio cierre. */
  estadoTransitorioProyecto?: string;
  /** Marca técnica del lock, no un dato de ejecución. */
  fechaActualizacion?: InstantLike;
  /** La membresía derivada del cierre no describe lo que se ejecutó. */
  membresiaDerivadaDelCierre?: unknown;
  postulaciones?: unknown;
  documentos?: unknown;
  /** El número del borrador nuevo cambia al preparar, no al ejecutar. */
  numeroBorradorNuevo?: number;
  /** Generar y enviar son eventos de este pipeline: el PDF no se invalida solo. */
  eventosPipeline?: unknown;
  /** Lecturas frescas de perfiles externos; la huella usa la presentación almacenada. */
  perfilesActuales?: unknown;
}

export interface ClosureExecutionContext {
  generatorVersion: string;
  projectId: number;
  /** Ciclo de revisión que ORIGINÓ el documento, no el borrador nuevo. */
  cicloRevisionOrigenId: number;
  datosEjecucion: ClosureExecutionInput;
  presentacion: ClosurePresentation;
  ambiente?: ClosureExcludedAmbient;
}

/**
 * Proyección de ejecución: el modelo canónico SIN el estado transitorio del
 * proyecto. Ese estado es lo único del modelo que el propio cierre mueve
 * (E→S), así que incluirlo haría que solicitar el cierre invalidara el
 * informe recién generado para solicitarlo.
 */
export function projectExecutionData(input: ClosureExecutionInput): Record<string, unknown> {
  const modelo = projectClosureModel(input);
  const proyecto = { ...modelo.proyecto };
  delete proyecto.estadoProyecto;
  return { ...modelo, proyecto };
}

/** Presentación canónica: usuarios y catálogos ordenados por identificador. */
function projectPresentation(presentacion: ClosurePresentation): Record<string, unknown> {
  return {
    usuarios: porId(presentacion.usuarios, (fila) => fila.id).map((fila) => ({
      id: fila.id,
      nombre: texto(fila.nombre, 'presentacion.usuario.nombre'),
    })),
    catalogos: [...presentacion.catalogos]
      .sort((a, b) => (a.tipo === b.tipo ? a.id - b.id : a.tipo < b.tipo ? -1 : 1))
      .map((fila) => ({
        tipo: texto(fila.tipo, 'presentacion.catalogo.tipo'),
        id: fila.id,
        nombre: texto(fila.nombre, 'presentacion.catalogo.nombre'),
      })),
  };
}

/**
 * `fingerprintEjecucion` (§28): identifica LO QUE SE EJECUTÓ.
 *
 * Su valor solo cambia cuando cambia el trabajo real del proyecto: una hora
 * reportada, un ajuste, un rol, una tarea. El estado transitorio del cierre,
 * la marca técnica del lock, las postulaciones, los documentos, el número del
 * borrador nuevo y los eventos de este pipeline quedan fuera por contrato.
 */
export function computeExecutionFingerprint(context: ClosureExecutionContext): string {
  return canonicalDigest(buildExecutionEnvelope(context));
}

/**
 * Revalida una huella existente con la presentación estrecha que quedó
 * guardada en el documento. El contexto histórico conserva el nombre
 * completo, mientras que el modelo legado del líder lo representó como dos
 * campos; se prueban sus divisiones posibles y solo se acepta una que
 * reproduzca exactamente la huella persistida.
 */
export function matchesStoredExecutionFingerprint(
  context: ClosureExecutionContext,
  expectedFingerprint: string,
): boolean {
  if (computeExecutionFingerprint(context) === expectedFingerprint) {
    return true;
  }
  const historicalLabel = context.presentacion.usuarios.find(
    (user) => user.id === context.datosEjecucion.lider.idUsuario,
  )?.nombre;
  if (!historicalLabel) {
    return false;
  }
  for (let index = 1; index < historicalLabel.length - 1; index += 1) {
    if (historicalLabel[index] !== ' ') {
      continue;
    }
    const nombre = historicalLabel.slice(0, index);
    const apellido = historicalLabel.slice(index + 1);
    if (!nombre || !apellido) {
      continue;
    }
    const datosEjecucion: ClosureExecutionInput = {
      ...context.datosEjecucion,
      lider: { ...context.datosEjecucion.lider, nombre, apellido },
    };
    if (computeExecutionFingerprint({ ...context, datosEjecucion }) === expectedFingerprint) {
      return true;
    }
  }
  return false;
}

export function buildExecutionEnvelope(context: ClosureExecutionContext): Record<string, unknown> {
  // `ambiente` se recibe y NO se usa: la exclusión es el contrato.
  return {
    schema: CLOSURE_EXECUTION_SCHEMA,
    generatorVersion: texto(context.generatorVersion, 'generatorVersion'),
    projectId: context.projectId,
    cicloRevisionOrigenId: context.cicloRevisionOrigenId,
    datosEjecucion: projectExecutionData(context.datosEjecucion),
    presentacion: projectPresentation(context.presentacion),
  };
}

/** Datos que solo existen en la entrega OFICIAL aprobada. */
export interface ClosureOfficialContext {
  revisionId: number;
  adminId: number;
  fechaAprobacion: InstantLike;
  horasFinales: Array<{ idParticipacion: number; horas: DecimalLike }>;
  manifiestoEntrega: Array<{ documentId: number; orden: number; checksumSha256: string }>;
}

export interface ClosureModelFingerprintInput {
  modelo: ClosureReportModelV1;
  fingerprintEjecucion: string;
  variante: ClosureReportVariant;
  oficial?: ClosureOfficialContext;
}

/**
 * `fingerprintModelo` (§28): identifica el MODELO PRESENTADO.
 *
 * El automático es el modelo de revisión construido sobre la ejecución; el
 * oficial añade la aprobación, las horas finales y el manifiesto de entrega.
 * Se mantienen separados de la huella de ejecución porque responden preguntas
 * distintas: una dice si el trabajo cambió, la otra qué documento se presentó.
 */
export function computeModelFingerprint(input: ClosureModelFingerprintInput): string {
  if (input.variante === 'OFICIAL' && !input.oficial) {
    throw new ClosureCanonicalizationError(
      'La variante oficial exige el contexto de aprobación y su manifiesto',
    );
  }
  const sobre: Record<string, unknown> = {
    schema: CLOSURE_MODEL_SCHEMA,
    variante: input.variante,
    fingerprintEjecucion: input.fingerprintEjecucion,
    modelo: input.modelo,
  };
  if (input.variante === 'OFICIAL' && input.oficial) {
    const oficial = input.oficial;
    sobre.oficial = {
      variante: 'OFICIAL',
      revisionId: oficial.revisionId,
      adminId: oficial.adminId,
      fechaAprobacion: instanteUtc(oficial.fechaAprobacion, 'oficial.fechaAprobacion'),
      estado: 'CERRADO',
      horasFinales: porId(oficial.horasFinales, (fila) => fila.idParticipacion).map((fila) => ({
        idParticipacion: fila.idParticipacion,
        horas: decimal2(fila.horas, 'oficial.horasFinales.horas'),
      })),
      manifiestoEntrega: [...oficial.manifiestoEntrega]
        .sort((a, b) => (a.orden === b.orden ? a.documentId - b.documentId : a.orden - b.orden))
        .map((fila) => ({
          documentId: fila.documentId,
          orden: fila.orden,
          checksumSha256: fila.checksumSha256,
        })),
    };
  }
  return canonicalDigest(sobre);
}

/**
 * `contextoReporte` de M5 (§35): schema CERRADO. Guarda el ciclo de origen, la
 * presentación estrecha, la variante y la fecha fija de generación — nunca
 * `datosEjecucion` generales, que se vuelven a consultar para validar la
 * huella en lugar de creerle a un JSON almacenado.
 */
export interface ClosureReportContext {
  schemaVersion: 1;
  cicloRevisionOrigenId: number;
  presentacion: ClosurePresentation;
  variante: ClosureReportVariant;
  fechaGeneracion: string;
  aprobacion?: { adminId: number; fechaAprobacion: string; revisionId: number };
}

export function buildReportContext(input: {
  cicloRevisionOrigenId: number;
  presentacion: ClosurePresentation;
  variante: ClosureReportVariant;
  fechaGeneracion: InstantLike;
  aprobacion?: { adminId: number; fechaAprobacion: InstantLike; revisionId: number };
}): ClosureReportContext {
  const contexto: ClosureReportContext = {
    schemaVersion: 1,
    cicloRevisionOrigenId: input.cicloRevisionOrigenId,
    presentacion: projectPresentation(input.presentacion) as unknown as ClosurePresentation,
    variante: input.variante,
    fechaGeneracion: instanteUtc(input.fechaGeneracion, 'fechaGeneracion') as string,
  };
  if (input.aprobacion) {
    contexto.aprobacion = {
      adminId: input.aprobacion.adminId,
      fechaAprobacion: instanteUtc(input.aprobacion.fechaAprobacion, 'aprobacion.fechaAprobacion') as string,
      revisionId: input.aprobacion.revisionId,
    };
  }
  return contexto;
}
