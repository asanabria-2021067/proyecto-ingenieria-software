/**
 * CLI administrativa de conciliación legacy de Sprint 7 (06 v2 §14, D1).
 *
 * NO es un endpoint público y nunca debe convertirse en uno: la conciliación
 * de datos históricos exige un administrador real, un manifiesto revisado y
 * una ejecución deliberada fuera del ciclo de request/response.
 *
 * Modos:
 *   diagnose            clasifica P-01…P-07 sin escribir absolutamente nada
 *   apply --manifest    aplica el efecto inequívoco descrito por un manifiesto
 *   verify              comprueba que lo aplicado sigue siendo coherente
 *
 * C148 crea únicamente el esqueleto: parseo, ayuda y resolución del actor.
 * `apply` y `verify` todavía no están implementados y salen con código
 * distinto de cero para que no puedan confundirse con una conciliación real.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
// Helper PURO del dominio de cierre (no importa Nest ni Prisma): reutilizarlo
// garantiza que la huella del manifiesto se calcule con exactamente la misma
// canonicalización que el resto de Sprint 7, en vez de con una copia divergente.
import { canonicalJson } from '../src/project-closure/closure-report-model';

export type LegacyMode = 'diagnose' | 'apply' | 'verify';

export interface LegacyCliOptions {
  mode: LegacyMode;
  adminId: number;
  manifestPath: string | null;
  projectId: number | null;
  json: boolean;
}

export class LegacyCliError extends Error {
  constructor(
    message: string,
    readonly exitCode: number = 2,
  ) {
    super(message);
    this.name = 'LegacyCliError';
  }
}

const MODES: readonly LegacyMode[] = ['diagnose', 'apply', 'verify'];

export const HELP_TEXT = `sprint7-legacy — conciliación de horas legacy (Sprint 7, 06 v2 §14)

USO
  npm run legacy:s7 -- <modo> --admin <idUsuario> [opciones]

MODOS
  diagnose            Clasifica P-01…P-07 y los tramos por procedencia.
                      Solo lectura: no escribe ninguna fila.
  apply --manifest    Aplica el efecto descrito por un manifiesto revisado.
                      Rechaza cualquier divergencia con 409 y rollback total.
  verify              Comprueba que un manifiesto ya aplicado sigue vigente.
                      No corrige nada: informar es su único efecto.

OPCIONES
  --admin <id>        Obligatorio. Usuario que debe ser administrador real en
                      la base de datos; sin él ningún modo se ejecuta.
  --manifest <ruta>   Obligatorio para apply y verify.
  --project <id>      Limita el diagnóstico a un proyecto concreto.
  --json              Emite el resultado como JSON en vez de texto.
  --help, -h          Muestra esta ayuda.

NOTAS
  Esta herramienta no expone ninguna ruta HTTP. Un manifiesto no sustituye a
  la evidencia: apply solo escribe cuando el estado leído bajo lock coincide
  exactamente con lo que el manifiesto declara.`;

/** Parsea argv sin dependencias externas. No toca la base de datos. */
export function parseArgs(argv: readonly string[]): LegacyCliOptions {
  const args = [...argv];
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    throw new LegacyCliError('__HELP__', 0);
  }

  const mode = args.shift() as LegacyMode;
  if (!MODES.includes(mode)) {
    throw new LegacyCliError(
      `Modo desconocido "${mode}". Modos válidos: ${MODES.join(', ')}.`,
    );
  }

  let adminId: number | null = null;
  let manifestPath: string | null = null;
  let projectId: number | null = null;
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const readValue = (): string => {
      const value = args[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new LegacyCliError(`La opción ${flag} requiere un valor.`);
      }
      index += 1;
      return value;
    };

    switch (flag) {
      case '--admin':
        adminId = parsePositiveInt(readValue(), '--admin');
        break;
      case '--manifest':
        manifestPath = readValue();
        break;
      case '--project':
        projectId = parsePositiveInt(readValue(), '--project');
        break;
      case '--json':
        json = true;
        break;
      default:
        throw new LegacyCliError(`Opción desconocida "${flag}".`);
    }
  }

  if (adminId === null) {
    throw new LegacyCliError('Falta --admin <idUsuario>: ningún modo se ejecuta sin actor.');
  }
  if ((mode === 'apply' || mode === 'verify') && manifestPath === null) {
    throw new LegacyCliError(`El modo ${mode} requiere --manifest <ruta>.`);
  }

  return { mode, adminId, manifestPath, projectId, json };
}

function parsePositiveInt(raw: string, flag: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new LegacyCliError(`${flag} debe ser un entero positivo, no "${raw}".`);
  }
  return value;
}

/**
 * Resuelve al actor contra la base: mismo criterio que
 * `ProjectPolicyService.assertAdmin` (usuarioRolAcceso → 'administrador').
 * Una lectura, cero escrituras.
 */
export async function resolveAdmin(
  prisma: Pick<PrismaClient, 'usuarioRolAcceso'>,
  adminId: number,
): Promise<{ idUsuario: number; nombre: string; apellido: string; correo: string }> {
  const record = await prisma.usuarioRolAcceso.findFirst({
    where: { idUsuario: adminId, rolAcceso: { nombrePerfil: 'administrador' } },
    select: {
      usuario: { select: { idUsuario: true, nombre: true, apellido: true, correo: true } },
    },
  });
  if (!record) {
    throw new LegacyCliError(
      `El usuario ${adminId} no es administrador en esta base de datos.`,
      3,
    );
  }
  return record.usuario;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Modo diagnose (06 v2 §14). SOLO LECTURA.
 *
 * Dos reglas que gobiernan todas las consultas de este bloque:
 *
 *  1. Los diagnósticos incluyen tareas eliminadas. Ninguna consulta filtra por
 *     `tarea.eliminado_en`: el conjunto histórico es el conjunto completo.
 *  2. Nunca se lee la bitácora para decidir qué importe debe sumarse. La
 *     procedencia se deriva de la presencia de registros y del importe
 *     almacenado, jamás de un evento de auditoría.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface DiagnosisRow {
  [column: string]: string | number | boolean | null;
}

export interface ProvenanceRow {
  idAsignacion: number;
  idProyecto: number;
  idSprint: number;
  origenActual: OrigenReporteTramo;
  origenSugerido: OrigenReporteTramo;
  cache: string | null;
  suma: string | null;
  registros: number;
  motivo: string;
}

export type OrigenReporteTramo = 'GRANULAR' | 'LEGACY' | 'POR_CONCILIAR';

export interface LegacyDiagnosis {
  p01: DiagnosisRow[];
  p02: DiagnosisRow[];
  p03: DiagnosisRow[];
  p04: DiagnosisRow[];
  p05: DiagnosisRow[];
  p06: DiagnosisRow[];
  p07: DiagnosisRow[];
  clasificacion: ProvenanceRow[];
}

type RawClient = Pick<PrismaClient, '$queryRaw' | '$queryRawUnsafe'>;

const decimalToString = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value);

/**
 * P-01: tramos con caché no nula y participación nula o incompatible.
 * Incompatible = la participación no pertenece al mismo usuario, o su rol no
 * pertenece al mismo proyecto que la tarea del tramo.
 */
async function queryP01(prisma: RawClient, projectFilter: string): Promise<DiagnosisRow[]> {
  return prisma.$queryRawUnsafe<DiagnosisRow[]>(`
    SELECT t.id_proyecto AS "idProyecto", s.id_sprint AS "idSprint",
           at.id_asignacion AS "idAsignacion", at.id_usuario AS "idUsuario",
           at.id_participacion AS "idParticipacion", at.horas_reales::text AS "horasReales",
           t.eliminado_en IS NOT NULL AS "tareaEliminada",
           CASE WHEN at.id_participacion IS NULL THEN 'PARTICIPACION_NULA'
                ELSE 'PARTICIPACION_INCOMPATIBLE' END AS "motivo"
    FROM asignacion_tarea at
    JOIN tarea t ON t.id_tarea = at.id_tarea
    JOIN sprint s ON s.id_sprint = t.id_sprint
    LEFT JOIN participacion_proyecto pp ON pp.id_participacion = at.id_participacion
    LEFT JOIN rol_proyecto rp ON rp.id_rol_proyecto = pp.id_rol_proyecto
    WHERE at.horas_reales IS NOT NULL
      AND (at.id_participacion IS NULL
           OR pp.id_usuario <> at.id_usuario
           OR rp.id_proyecto <> t.id_proyecto)
      ${projectFilter}
    ORDER BY t.id_proyecto, s.id_sprint, at.id_asignacion
  `);
}

/**
 * P-02: tramos GRANULAR cuya caché difiere del SUM de sus registros efectivos,
 * incluidos los abiertos y los ya reconocidos. Un registro revocado no es
 * efectivo y por eso no entra en la suma.
 */
async function queryP02(prisma: RawClient, projectFilter: string): Promise<DiagnosisRow[]> {
  return prisma.$queryRawUnsafe<DiagnosisRow[]>(`
    SELECT t.id_proyecto AS "idProyecto", s.id_sprint AS "idSprint",
           at.id_asignacion AS "idAsignacion", at.horas_reales::text AS "cache",
           COALESCE(r.suma, 0)::text AS "suma",
           at.desasignada_en IS NULL AS "abierto",
           at.reconocido_en IS NOT NULL AS "reconocido",
           t.eliminado_en IS NOT NULL AS "tareaEliminada"
    FROM asignacion_tarea at
    JOIN tarea t ON t.id_tarea = at.id_tarea
    JOIN sprint s ON s.id_sprint = t.id_sprint
    LEFT JOIN (
      SELECT id_asignacion, SUM(horas) AS suma
      FROM registro_tiempo_tarea
      WHERE revocado_en IS NULL
      GROUP BY id_asignacion
    ) r ON r.id_asignacion = at.id_asignacion
    WHERE at.origen_reporte = 'GRANULAR'
      AND COALESCE(at.horas_reales, 0) <> COALESCE(r.suma, 0)
      ${projectFilter}
    ORDER BY t.id_proyecto, s.id_sprint, at.id_asignacion
  `);
}

/**
 * P-03: Sprints cerrados con tramos todavía abiertos, o con tareas HECHO sin
 * ninguna ejecución histórica que las respalde.
 */
async function queryP03(prisma: RawClient, projectFilter: string): Promise<DiagnosisRow[]> {
  return prisma.$queryRawUnsafe<DiagnosisRow[]>(`
    SELECT t.id_proyecto AS "idProyecto", s.id_sprint AS "idSprint",
           t.id_tarea AS "idTarea", at.id_asignacion AS "idAsignacion",
           'TRAMO_ABIERTO_EN_SPRINT_CERRADO' AS "motivo"
    FROM asignacion_tarea at
    JOIN tarea t ON t.id_tarea = at.id_tarea
    JOIN sprint s ON s.id_sprint = t.id_sprint
    WHERE s.estado = 'CERRADO' AND at.desasignada_en IS NULL
      ${projectFilter}
    UNION ALL
    SELECT t.id_proyecto AS "idProyecto", s.id_sprint AS "idSprint",
           t.id_tarea AS "idTarea", NULL::int AS "idAsignacion",
           'TAREA_HECHO_SIN_EJECUCION' AS "motivo"
    FROM tarea t
    JOIN sprint s ON s.id_sprint = t.id_sprint
    WHERE s.estado = 'CERRADO' AND t.estado_tarea = 'HECHO'
      AND NOT EXISTS (SELECT 1 FROM asignacion_tarea a WHERE a.id_tarea = t.id_tarea)
      ${projectFilter}
    ORDER BY "idProyecto", "idSprint", "idTarea", "idAsignacion"
  `);
}

/**
 * P-04: proyectos terminales con soft-delete o con horas de aprobación
 * inconsistentes. Un proyecto CERRADO no lleva `eliminado_en` (06 v2 §31) y no
 * puede conservar horas PENDIENTE.
 */
async function queryP04(prisma: RawClient, projectFilter: string): Promise<DiagnosisRow[]> {
  return prisma.$queryRawUnsafe<DiagnosisRow[]>(`
    SELECT p.id_proyecto AS "idProyecto", p.estado_proyecto::text AS "estadoProyecto",
           p.eliminado_en IS NOT NULL AS "eliminado",
           COUNT(hp.id_registro_horas) FILTER (WHERE hp.estado_horas = 'PENDIENTE')::int AS "horasPendientes",
           CASE WHEN p.eliminado_en IS NOT NULL THEN 'TERMINAL_CON_SOFT_DELETE'
                ELSE 'TERMINAL_CON_HORAS_PENDIENTES' END AS "motivo"
    FROM proyecto p
    LEFT JOIN rol_proyecto rp ON rp.id_proyecto = p.id_proyecto
    LEFT JOIN participacion_proyecto pp ON pp.id_rol_proyecto = rp.id_rol_proyecto
    LEFT JOIN horas_participacion hp ON hp.id_participacion = pp.id_participacion
    WHERE p.estado_proyecto IN ('CERRADO', 'CANCELADO')
      ${projectFilter.replace(/t\.id_proyecto/g, 'p.id_proyecto')}
    GROUP BY p.id_proyecto, p.estado_proyecto, p.eliminado_en
    HAVING p.eliminado_en IS NOT NULL
        OR COUNT(hp.id_registro_horas) FILTER (WHERE hp.estado_horas = 'PENDIENTE') > 0
    ORDER BY p.id_proyecto
  `);
}

/**
 * P-05: Sprints cerrados con reporte no consumido. Proyección de columnas
 * EXACTA de 06 v2 §14, incluidas las tareas eliminadas.
 */
async function queryP05(prisma: RawClient, projectFilter: string): Promise<DiagnosisRow[]> {
  return prisma.$queryRawUnsafe<DiagnosisRow[]>(`
    SELECT t.id_proyecto AS "id_proyecto", s.id_sprint AS "id_sprint",
           at.id_asignacion AS "id_asignacion", at.id_usuario AS "id_usuario",
           at.id_participacion AS "id_participacion", at.horas_reales::text AS "horas_reales",
           at.desasignada_en AS "desasignada_en", at.reconocido_en AS "reconocido_en",
           t.eliminado_en AS "eliminado_en"
    FROM asignacion_tarea at
    JOIN tarea t ON t.id_tarea = at.id_tarea
    JOIN sprint s ON s.id_sprint = t.id_sprint
    WHERE s.estado = 'CERRADO'
      AND at.horas_reales IS NOT NULL AND at.reconocido_en IS NULL
      ${projectFilter}
    ORDER BY t.id_proyecto, s.id_sprint, at.id_asignacion
  `);
}

/**
 * P-06: agregados históricos con `id_sprint` NULL, en un estado distinto de
 * PENDIENTE, o sin ningún tramo del mismo Sprint que pueda respaldarlos.
 */
async function queryP06(prisma: RawClient, projectFilter: string): Promise<DiagnosisRow[]> {
  return prisma.$queryRawUnsafe<DiagnosisRow[]>(`
    SELECT rp.id_proyecto AS "idProyecto", hp.id_registro_horas AS "idRegistroHoras",
           hp.id_participacion AS "idParticipacion", hp.id_sprint AS "idSprint",
           hp.estado_horas::text AS "estadoHoras", hp.horas_reportadas::text AS "horasReportadas",
           CASE WHEN hp.id_sprint IS NULL THEN 'AGREGADO_SIN_SPRINT'
                WHEN hp.estado_horas <> 'PENDIENTE' THEN 'AGREGADO_NO_PENDIENTE'
                ELSE 'AGREGADO_SIN_CORRESPONDENCIA' END AS "motivo"
    FROM horas_participacion hp
    JOIN participacion_proyecto pp ON pp.id_participacion = hp.id_participacion
    JOIN rol_proyecto rp ON rp.id_rol_proyecto = pp.id_rol_proyecto
    WHERE hp.id_sprint IS NULL
       OR hp.estado_horas <> 'PENDIENTE'
       OR NOT EXISTS (
            SELECT 1 FROM asignacion_tarea at
            JOIN tarea t ON t.id_tarea = at.id_tarea
            WHERE at.id_participacion = hp.id_participacion AND t.id_sprint = hp.id_sprint
          )
      ${projectFilter.replace(/t\.id_proyecto/g, 'rp.id_proyecto')}
    ORDER BY rp.id_proyecto, hp.id_registro_horas
  `);
}

/** P-07: proyectos en EN_SOLICITUD_CIERRE sin ninguna revisión de cierre nueva. */
async function queryP07(prisma: RawClient, projectFilter: string): Promise<DiagnosisRow[]> {
  return prisma.$queryRawUnsafe<DiagnosisRow[]>(`
    SELECT p.id_proyecto AS "idProyecto", p.estado_proyecto::text AS "estadoProyecto",
           'SOLICITUD_CIERRE_SIN_REVISION' AS "motivo"
    FROM proyecto p
    WHERE p.estado_proyecto = 'EN_SOLICITUD_CIERRE'
      AND NOT EXISTS (
        SELECT 1 FROM revision_cierre_proyecto r WHERE r.id_proyecto = p.id_proyecto
      )
      ${projectFilter.replace(/t\.id_proyecto/g, 'p.id_proyecto')}
    ORDER BY p.id_proyecto
  `);
}

/**
 * Clasificación inicial de procedencia (06 v2 §14), derivada exclusivamente de
 * la presencia de registros efectivos y del importe almacenado:
 *
 *   sin registros + caché no nula        → LEGACY
 *   con registros + caché coherente      → GRANULAR
 *   sin registros + caché nula           → GRANULAR (cerrado se normaliza a 0)
 *   mezcla o discrepancia                → POR_CONCILIAR
 */
async function queryProvenance(
  prisma: RawClient,
  projectFilter: string,
): Promise<ProvenanceRow[]> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      idAsignacion: number;
      idProyecto: number;
      idSprint: number;
      origenActual: OrigenReporteTramo;
      cache: string | null;
      suma: string | null;
      registros: number;
    }>
  >(`
    SELECT at.id_asignacion AS "idAsignacion", t.id_proyecto AS "idProyecto",
           s.id_sprint AS "idSprint", at.origen_reporte::text AS "origenActual",
           at.horas_reales::text AS "cache",
           r.suma::text AS "suma",
           COALESCE(r.registros, 0)::int AS "registros"
    FROM asignacion_tarea at
    JOIN tarea t ON t.id_tarea = at.id_tarea
    JOIN sprint s ON s.id_sprint = t.id_sprint
    LEFT JOIN (
      SELECT id_asignacion, SUM(horas) AS suma, COUNT(*) AS registros
      FROM registro_tiempo_tarea
      WHERE revocado_en IS NULL
      GROUP BY id_asignacion
    ) r ON r.id_asignacion = at.id_asignacion
    WHERE TRUE ${projectFilter}
    ORDER BY t.id_proyecto, s.id_sprint, at.id_asignacion
  `);

  return rows.map((row) => {
    const cache = decimalToString(row.cache);
    const suma = decimalToString(row.suma);
    let origenSugerido: OrigenReporteTramo;
    let motivo: string;

    if (row.registros === 0 && cache !== null) {
      origenSugerido = 'LEGACY';
      motivo = 'SIN_REGISTROS_CACHE_NO_NULA';
    } else if (row.registros === 0 && cache === null) {
      origenSugerido = 'GRANULAR';
      motivo = 'SIN_REGISTROS_CACHE_NULA';
    } else if (cache !== null && suma !== null && Number(cache) === Number(suma)) {
      origenSugerido = 'GRANULAR';
      motivo = 'REGISTROS_Y_CACHE_COHERENTE';
    } else {
      origenSugerido = 'POR_CONCILIAR';
      motivo = 'MEZCLA_O_DISCREPANCIA';
    }

    return {
      idAsignacion: row.idAsignacion,
      idProyecto: row.idProyecto,
      idSprint: row.idSprint,
      origenActual: row.origenActual,
      origenSugerido,
      cache,
      suma,
      registros: row.registros,
      motivo,
    };
  });
}

/** Ejecuta los siete predicados y la clasificación. Cero escrituras. */
export async function diagnose(
  prisma: RawClient,
  options: { projectId?: number | null } = {},
): Promise<LegacyDiagnosis> {
  const projectId = options.projectId ?? null;
  // Único punto de interpolación: un entero ya validado por parseArgs, nunca
  // texto del usuario.
  const filter = projectId === null ? '' : `AND t.id_proyecto = ${projectId}`;

  const [p01, p02, p03, p04, p05, p06, p07, clasificacion] = await Promise.all([
    queryP01(prisma, filter),
    queryP02(prisma, filter),
    queryP03(prisma, filter),
    queryP04(prisma, filter),
    queryP05(prisma, filter),
    queryP06(prisma, filter),
    queryP07(prisma, filter),
    queryProvenance(prisma, filter),
  ]);

  return { p01, p02, p03, p04, p05, p06, p07, clasificacion };
}

const PREDICATE_LABELS: Record<string, string> = {
  p01: 'P-01 tramos con importe y participación nula o incompatible',
  p02: 'P-02 tramos GRANULAR con caché distinta de la suma de registros',
  p03: 'P-03 Sprints cerrados con trabajo abierto o tareas HECHO sin ejecución',
  p04: 'P-04 proyectos terminales inconsistentes',
  p05: 'P-05 Sprints cerrados con reporte no consumido',
  p06: 'P-06 agregados históricos malformados',
  p07: 'P-07 proyectos en solicitud de cierre sin revisión',
};

export function formatDiagnosis(report: LegacyDiagnosis): string {
  const lines: string[] = [];
  for (const key of ['p01', 'p02', 'p03', 'p04', 'p05', 'p06', 'p07'] as const) {
    const rows = report[key];
    lines.push(`\n${PREDICATE_LABELS[key]}: ${rows.length}`);
    for (const row of rows) {
      lines.push(`  ${JSON.stringify(row)}`);
    }
  }
  const divergent = report.clasificacion.filter((row) => row.origenActual !== row.origenSugerido);
  lines.push(`\nClasificación de procedencia: ${report.clasificacion.length} tramos, ${divergent.length} divergentes`);
  for (const row of divergent) {
    lines.push(
      `  tramo ${row.idAsignacion} (proyecto ${row.idProyecto}, sprint ${row.idSprint}): ` +
        `${row.origenActual} → ${row.origenSugerido} [${row.motivo}]`,
    );
  }
  return lines.join('\n');
}

/* ────────────────────────────────────────────────────────────────────────────
 * Manifiesto y rechazo de ambigüedad (06 v2 §14).
 *
 * Regla que gobierna todo este bloque: **un manifiesto no sustituye a la
 * evidencia**. Que alguien haya escrito una atribución en un fichero no la
 * convierte en verdad histórica; la CLI vuelve a demostrarla contra la base y,
 * si no puede, rechaza en vez de adivinar.
 * ──────────────────────────────────────────────────────────────────────────── */

export const LEGACY_MANIFEST_VERSION = 'sprint7-legacy-manifest-v1' as const;

export const LEGACY_ACTIONS = [
  'ENLAZAR',
  'CONSUMIR_NUEVO',
  'CONSUMIR_INCREMENTO',
  'MARCAR_YA_INCLUIDO',
  'CLASIFICAR_REPORTE',
] as const;
export type LegacyAction = (typeof LEGACY_ACTIONS)[number];

export interface LegacyManifestEntry {
  accion: LegacyAction;
  idAsignacion: number;
  /** Participación histórica que el revisor afirma haber demostrado. */
  idParticipacion: number;
  /** Agregado afectado cuando la acción lo requiere. */
  idRegistroHoras: number | null;
  importeAnterior: string | null;
  importeEsperado: string;
}

export interface LegacyManifest {
  version: string;
  /** Identificador de la ejecución de diagnóstico sobre la que se construyó. */
  baseline: string;
  adminId: number;
  projectId: number;
  sprintId: number;
  /** Evidencia externa identificable revisada por una persona. */
  evidencia: string;
  entradas: LegacyManifestEntry[];
  /** SHA-256 del conjunto esperado (`entradas` canonicalizadas). */
  sha256: string;
}

/** Huella del conjunto esperado. Determinista e independiente del entorno. */
export function manifestEntriesHash(entradas: readonly LegacyManifestEntry[]): string {
  return createHash('sha256').update(canonicalJson(entradas), 'utf8').digest('hex');
}

/** Huella del manifiesto completo, para citarla en la bitácora. */
export function manifestHash(manifest: LegacyManifest): string {
  const { sha256: _ignored, ...rest } = manifest;
  return createHash('sha256').update(canonicalJson(rest), 'utf8').digest('hex');
}

export function loadManifest(path: string): LegacyManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new LegacyCliError(
      `No se pudo leer el manifiesto "${path}": ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return validateManifest(parsed);
}

export function validateManifest(value: unknown): LegacyManifest {
  const fail = (reason: string): never => {
    throw new LegacyCliError(`Manifiesto inválido: ${reason}`);
  };
  if (typeof value !== 'object' || value === null) fail('no es un objeto');
  const raw = value as Record<string, unknown>;

  if (raw.version !== LEGACY_MANIFEST_VERSION) {
    fail(`versión "${String(raw.version)}"; se esperaba "${LEGACY_MANIFEST_VERSION}"`);
  }
  for (const field of ['baseline', 'evidencia', 'sha256'] as const) {
    if (typeof raw[field] !== 'string' || (raw[field] as string).length === 0) {
      fail(`falta el campo obligatorio "${field}"`);
    }
  }
  for (const field of ['adminId', 'projectId', 'sprintId'] as const) {
    if (!Number.isInteger(raw[field]) || (raw[field] as number) <= 0) {
      fail(`"${field}" debe ser un entero positivo`);
    }
  }
  if (!Array.isArray(raw.entradas) || raw.entradas.length === 0) {
    fail('"entradas" debe ser una lista no vacía');
  }

  const entradas = (raw.entradas as unknown[]).map((item, index) => {
    if (typeof item !== 'object' || item === null) fail(`entrada ${index} no es un objeto`);
    const entry = item as Record<string, unknown>;
    if (!LEGACY_ACTIONS.includes(entry.accion as LegacyAction)) {
      fail(`entrada ${index}: acción "${String(entry.accion)}" fuera del enum`);
    }
    for (const field of ['idAsignacion', 'idParticipacion'] as const) {
      if (!Number.isInteger(entry[field]) || (entry[field] as number) <= 0) {
        fail(`entrada ${index}: "${field}" debe ser un entero positivo`);
      }
    }
    if (
      entry.idRegistroHoras !== null &&
      (!Number.isInteger(entry.idRegistroHoras) || (entry.idRegistroHoras as number) <= 0)
    ) {
      fail(`entrada ${index}: "idRegistroHoras" debe ser un entero positivo o null`);
    }
    if (entry.importeAnterior !== null && typeof entry.importeAnterior !== 'string') {
      fail(`entrada ${index}: "importeAnterior" debe ser una cadena decimal o null`);
    }
    if (typeof entry.importeEsperado !== 'string') {
      fail(`entrada ${index}: "importeEsperado" debe ser una cadena decimal`);
    }
    return {
      accion: entry.accion as LegacyAction,
      idAsignacion: entry.idAsignacion as number,
      idParticipacion: entry.idParticipacion as number,
      idRegistroHoras: (entry.idRegistroHoras ?? null) as number | null,
      importeAnterior: (entry.importeAnterior ?? null) as string | null,
      importeEsperado: entry.importeEsperado as string,
    } satisfies LegacyManifestEntry;
  });

  const manifest: LegacyManifest = {
    version: raw.version as string,
    baseline: raw.baseline as string,
    adminId: raw.adminId as number,
    projectId: raw.projectId as number,
    sprintId: raw.sprintId as number,
    evidencia: raw.evidencia as string,
    entradas,
    sha256: raw.sha256 as string,
  };

  const expected = manifestEntriesHash(entradas);
  if (manifest.sha256 !== expected) {
    fail(`el SHA-256 declarado no corresponde al conjunto de entradas (esperado ${expected})`);
  }
  return manifest;
}

export interface LegacyRefusal {
  idAsignacion: number;
  idParticipacion: number | null;
  idRegistroHoras: number | null;
  motivo: string;
  detalle: string;
  ids: number[];
}

/**
 * Comprueba, contra la base, si cada entrada del manifiesto puede demostrarse.
 *
 * Un candidato válido exige el **mismo usuario y proyecto** y evidencia del rol
 * y la participación **del tramo histórico**. Ni el rol actual de la tarea, ni
 * una `fechaIngreso` reescrita por reactivación, ni la participación `ACTIVO`
 * de hoy prueban ese pasado, y ningún MIN/MAX ni «la primera fila» desempata.
 */
export async function assessManifest(
  prisma: Pick<PrismaClient, '$queryRawUnsafe'>,
  manifest: LegacyManifest,
): Promise<LegacyRefusal[]> {
  const refusals: LegacyRefusal[] = [];
  const assignmentIds = manifest.entradas.map((entry) => entry.idAsignacion);

  const tramos = await prisma.$queryRawUnsafe<
    Array<{
      idAsignacion: number;
      idUsuario: number;
      idParticipacion: number | null;
      idProyecto: number;
      idSprint: number;
      horasReales: string | null;
      reconocidoEn: Date | null;
      estadoProyecto: string;
      proyectoEliminado: boolean;
    }>
  >(`
    SELECT at.id_asignacion AS "idAsignacion", at.id_usuario AS "idUsuario",
           at.id_participacion AS "idParticipacion", t.id_proyecto AS "idProyecto",
           t.id_sprint AS "idSprint", at.horas_reales::text AS "horasReales",
           at.reconocido_en AS "reconocidoEn", p.estado_proyecto::text AS "estadoProyecto",
           p.eliminado_en IS NOT NULL AS "proyectoEliminado"
    FROM asignacion_tarea at
    JOIN tarea t ON t.id_tarea = at.id_tarea
    JOIN proyecto p ON p.id_proyecto = t.id_proyecto
    WHERE at.id_asignacion IN (${assignmentIds.join(',')})
  `);
  const byAssignment = new Map(tramos.map((row) => [row.idAsignacion, row]));

  for (const entry of manifest.entradas) {
    const tramo = byAssignment.get(entry.idAsignacion);
    const refuse = (motivo: string, detalle: string, ids: number[] = []): void => {
      refusals.push({
        idAsignacion: entry.idAsignacion,
        idParticipacion: entry.idParticipacion,
        idRegistroHoras: entry.idRegistroHoras,
        motivo,
        detalle,
        ids,
      });
    };

    if (!tramo) {
      refuse('TRAMO_INEXISTENTE', 'El tramo del manifiesto no existe en esta base.');
      continue;
    }
    if (tramo.idProyecto !== manifest.projectId || tramo.idSprint !== manifest.sprintId) {
      refuse(
        'TRAMO_FUERA_DE_ALCANCE',
        `El tramo pertenece al proyecto ${tramo.idProyecto} y al Sprint ${tramo.idSprint}, no a los del manifiesto.`,
      );
      continue;
    }
    // Proyecto terminal o con soft-delete: se conserva la historia y se excluye
    // del apply de Sprint 7; su resolución es administrativa e independiente.
    if (tramo.estadoProyecto === 'CERRADO' || tramo.estadoProyecto === 'CANCELADO' || tramo.proyectoEliminado) {
      refuse(
        'PROYECTO_TERMINAL_O_ELIMINADO',
        `El proyecto está en ${tramo.estadoProyecto}${tramo.proyectoEliminado ? ' con soft-delete' : ''}: no se altera automáticamente.`,
      );
      continue;
    }

    // ── Evidencia de la participación histórica del propio tramo.
    const candidates = await prisma.$queryRawUnsafe<
      Array<{
        idParticipacion: number;
        idUsuario: number;
        idProyecto: number;
        idRolProyecto: number;
        estadoParticipacion: string;
        fechaIngreso: Date;
        fechaSalida: Date | null;
        reactivada: boolean;
      }>
    >(`
      SELECT pp.id_participacion AS "idParticipacion", pp.id_usuario AS "idUsuario",
             rp.id_proyecto AS "idProyecto", pp.id_rol_proyecto AS "idRolProyecto",
             pp.estado_participacion::text AS "estadoParticipacion",
             pp.fecha_ingreso AS "fechaIngreso", pp.fecha_salida AS "fechaSalida",
             (pp.fecha_ingreso > at.fecha_asignacion) AS "reactivada"
      FROM participacion_proyecto pp
      JOIN rol_proyecto rp ON rp.id_rol_proyecto = pp.id_rol_proyecto
      JOIN asignacion_tarea at ON at.id_asignacion = ${entry.idAsignacion}
      WHERE pp.id_usuario = ${tramo.idUsuario} AND rp.id_proyecto = ${tramo.idProyecto}
      ORDER BY pp.id_participacion
    `);

    const declared = candidates.find((row) => row.idParticipacion === entry.idParticipacion);
    if (!declared) {
      refuse(
        'PARTICIPACION_NO_CORRESPONDE',
        'La participación declarada no pertenece al mismo usuario y proyecto que el tramo.',
        candidates.map((row) => row.idParticipacion),
      );
      continue;
    }
    // Varias historias de participación con roles distintos: la verdad
    // histórica no puede deducirse de las filas actuales.
    const distinctRoles = new Set(candidates.map((row) => row.idRolProyecto));
    if (candidates.length > 1 && distinctRoles.size > 1) {
      refuse(
        'PARTICIPACION_AMBIGUA',
        `El usuario tuvo ${candidates.length} historias de participación con ${distinctRoles.size} roles distintos; ninguna regla de desempate es admisible.`,
        candidates.map((row) => row.idParticipacion),
      );
      continue;
    }
    // fechaIngreso posterior al propio tramo: la fila fue reescrita por una
    // reactivación y por tanto no prueba el pasado que se le atribuye.
    if (declared.reactivada) {
      refuse(
        'FECHA_INGRESO_REESCRITA',
        'La fecha de ingreso de la participación es posterior al tramo: fue reescrita por una reactivación y no demuestra ese pasado.',
        [declared.idParticipacion],
      );
      continue;
    }

    // ── Agregado afectado.
    if (entry.idRegistroHoras !== null) {
      const aggregates = await prisma.$queryRawUnsafe<
        Array<{
          idRegistroHoras: number;
          idParticipacion: number;
          estadoHoras: string;
          idSprint: number | null;
          horasReportadas: string;
        }>
      >(`
        SELECT hp.id_registro_horas AS "idRegistroHoras", hp.id_participacion AS "idParticipacion",
               hp.estado_horas::text AS "estadoHoras", hp.id_sprint AS "idSprint",
               hp.horas_reportadas::text AS "horasReportadas"
        FROM horas_participacion hp
        WHERE hp.id_registro_horas = ${entry.idRegistroHoras}
      `);
      const aggregate = aggregates[0];
      if (!aggregate) {
        refuse('AGREGADO_INEXISTENTE', 'El agregado declarado no existe.');
        continue;
      }
      if (aggregate.estadoHoras !== 'PENDIENTE') {
        refuse(
          'AGREGADO_NO_PENDIENTE',
          `El agregado está en ${aggregate.estadoHoras}: no se altera automáticamente y su resolución es administrativa.`,
          [aggregate.idRegistroHoras],
        );
        continue;
      }
      if (aggregate.idParticipacion !== entry.idParticipacion) {
        refuse(
          'AGREGADO_DE_OTRA_PARTICIPACION',
          'El agregado pertenece a otra participación distinta de la declarada.',
          [aggregate.idRegistroHoras],
        );
        continue;
      }
    }

    // ── El importe anterior declarado debe coincidir con el almacenado.
    const stored = tramo.horasReales;
    const declaredPrevious = entry.importeAnterior;
    const same =
      (stored === null && declaredPrevious === null) ||
      (stored !== null && declaredPrevious !== null && Number(stored) === Number(declaredPrevious));
    if (!same) {
      refuse(
        'IMPORTE_ANTERIOR_DIVERGENTE',
        `El manifiesto declara ${declaredPrevious ?? 'null'} pero la base almacena ${stored ?? 'null'}.`,
      );
      continue;
    }
  }

  return refusals;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Modo apply (06 v2 §14). ESCRIBE, y por eso vuelve a demostrarlo todo.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Huella del estado relevante de un proyecto y Sprint. El manifiesto la fija
 * como `baseline`; si la base se movió entre el diagnóstico y la aplicación, la
 * huella deja de coincidir y `apply` se niega en vez de escribir sobre un
 * estado que nadie revisó.
 */
export async function computeBaseline(
  prisma: Pick<PrismaClient, '$queryRawUnsafe'>,
  projectId: number,
  sprintId: number,
): Promise<string> {
  const tramos = await prisma.$queryRawUnsafe<
    Array<{
      idAsignacion: number;
      idParticipacion: number | null;
      horasReales: string | null;
      reconocido: boolean;
      origenReporte: string;
    }>
  >(`
    SELECT at.id_asignacion AS "idAsignacion", at.id_participacion AS "idParticipacion",
           at.horas_reales::text AS "horasReales", at.reconocido_en IS NOT NULL AS "reconocido",
           at.origen_reporte::text AS "origenReporte"
    FROM asignacion_tarea at
    JOIN tarea t ON t.id_tarea = at.id_tarea
    WHERE t.id_proyecto = ${projectId} AND t.id_sprint = ${sprintId}
    ORDER BY at.id_asignacion
  `);
  const agregados = await prisma.$queryRawUnsafe<
    Array<{
      idRegistroHoras: number;
      idParticipacion: number;
      idSprint: number | null;
      estadoHoras: string;
      horasReportadas: string;
    }>
  >(`
    SELECT hp.id_registro_horas AS "idRegistroHoras", hp.id_participacion AS "idParticipacion",
           hp.id_sprint AS "idSprint", hp.estado_horas::text AS "estadoHoras",
           hp.horas_reportadas::text AS "horasReportadas"
    FROM horas_participacion hp
    JOIN participacion_proyecto pp ON pp.id_participacion = hp.id_participacion
    JOIN rol_proyecto rp ON rp.id_rol_proyecto = pp.id_rol_proyecto
    WHERE rp.id_proyecto = ${projectId} AND hp.id_sprint = ${sprintId}
    ORDER BY hp.id_registro_horas
  `);
  return createHash('sha256')
    .update(canonicalJson({ projectId, sprintId, tramos, agregados }), 'utf8')
    .digest('hex');
}

export interface LegacyApplyResult {
  applied: number;
  noop: number;
  detalle: Array<{ idAsignacion: number; accion: LegacyAction; efecto: 'APLICADO' | 'NO_OP' }>;
}

export class LegacyDivergenceError extends LegacyCliError {
  constructor(
    message: string,
    readonly divergencias: string[],
  ) {
    super(message, 9);
    this.name = 'LegacyDivergenceError';
  }
}

/**
 * Aplica un manifiesto ya demostrado. Todo ocurre dentro de UNA transacción por
 * proyecto y Sprint, bajo el lock del proyecto, en orden ascendente de tramo.
 *
 * Ninguna acción crea un agregado `APROBADA`, reabre un Sprint ni corrige una
 * tarea cerrada: acreditar es competencia del administrador en el cierre, no de
 * una herramienta de datos.
 */
export async function applyManifest(
  prisma: PrismaClient,
  manifest: LegacyManifest,
  adminId: number,
): Promise<LegacyApplyResult> {
  // Import diferido: mantiene el arranque de `--help` y `diagnose` libre de Nest.
  const { ProjectTransactionService } = await import(
    '../src/common/project-policy/project-transaction.service'
  );
  const { BitacoraEventosService } = await import('../src/bitacora/bitacora-eventos.service');
  const { TipoEventoBitacora } = await import('../src/bitacora/tipos-evento-bitacora');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runner = new ProjectTransactionService(prisma as any);
  const audit = new BitacoraEventosService();
  const hash = manifestHash(manifest);
  const entries = [...manifest.entradas].sort((a, b) => a.idAsignacion - b.idAsignacion);

  return runner.run(manifest.projectId, adminId, 'legacy.apply', async ({ tx }) => {
    // 1. Releer todo y comparar la huella del estado revisado.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const actual = await computeBaseline(tx as any, manifest.projectId, manifest.sprintId);
    if (actual !== manifest.baseline) {
      throw new LegacyDivergenceError(
        'El estado del proyecto cambió desde el diagnóstico que originó el manifiesto.',
        [`baseline esperado ${manifest.baseline}, actual ${actual}`],
      );
    }

    const detalle: LegacyApplyResult['detalle'] = [];
    let applied = 0;
    let noop = 0;

    for (const entry of entries) {
      const tramo = await tx.asignacionTarea.findFirst({
        where: { idAsignacion: entry.idAsignacion, tarea: { idProyecto: manifest.projectId } },
        select: {
          idAsignacion: true,
          idParticipacion: true,
          horasReales: true,
          reconocidoEn: true,
          origenReporte: true,
          tarea: { select: { idSprint: true } },
        },
      });
      if (!tramo || tramo.tarea.idSprint !== manifest.sprintId) {
        throw new LegacyDivergenceError('Un tramo del manifiesto ya no corresponde.', [
          `tramo ${entry.idAsignacion}`,
        ]);
      }
      // 2. El importe declarado debe seguir siendo el almacenado.
      const stored = tramo.horasReales === null ? null : tramo.horasReales.toFixed(2);
      const expectedPrevious =
        entry.importeAnterior === null ? null : Number(entry.importeAnterior).toFixed(2);
      if (stored !== expectedPrevious) {
        throw new LegacyDivergenceError('El importe anterior del manifiesto ya no corresponde.', [
          `tramo ${entry.idAsignacion}: almacenado ${stored ?? 'null'}, manifiesto ${expectedPrevious ?? 'null'}`,
        ]);
      }

      const antes = {
        idParticipacion: tramo.idParticipacion,
        horasReales: stored,
        reconocido: tramo.reconocidoEn !== null,
        origenReporte: tramo.origenReporte,
      };

      // 3. Idempotencia: si el efecto ya está exactamente aplicado, no-op.
      const yaConsumido = tramo.reconocidoEn !== null;
      if (
        (entry.accion === 'CONSUMIR_NUEVO' || entry.accion === 'MARCAR_YA_INCLUIDO') &&
        yaConsumido &&
        tramo.idParticipacion === entry.idParticipacion
      ) {
        noop += 1;
        detalle.push({ idAsignacion: entry.idAsignacion, accion: entry.accion, efecto: 'NO_OP' });
        continue;
      }
      if (entry.accion === 'ENLAZAR' && tramo.idParticipacion === entry.idParticipacion) {
        noop += 1;
        detalle.push({ idAsignacion: entry.idAsignacion, accion: entry.accion, efecto: 'NO_OP' });
        continue;
      }

      // 4. Efecto, siempre con compare-and-set sobre el estado que se leyó.
      let creado: number | null = null;
      if (entry.accion === 'ENLAZAR' || entry.accion === 'CONSUMIR_NUEVO') {
        if (tramo.idParticipacion === null) {
          const linked = await tx.asignacionTarea.updateMany({
            where: { idAsignacion: entry.idAsignacion, idParticipacion: null },
            data: { idParticipacion: entry.idParticipacion },
          });
          if (linked.count !== 1) {
            throw new LegacyDivergenceError('La participación del tramo cambió durante la aplicación.', [
              `tramo ${entry.idAsignacion}`,
            ]);
          }
        } else if (tramo.idParticipacion !== entry.idParticipacion) {
          throw new LegacyDivergenceError('El tramo ya apunta a otra participación.', [
            `tramo ${entry.idAsignacion}`,
          ]);
        }
      }

      if (entry.accion === 'CONSUMIR_NUEVO' || entry.accion === 'MARCAR_YA_INCLUIDO') {
        const marked = await tx.asignacionTarea.updateMany({
          where: { idAsignacion: entry.idAsignacion, reconocidoEn: null },
          data: { reconocidoEn: new Date() },
        });
        if (marked.count !== 1) {
          throw new LegacyDivergenceError('El tramo fue consumido por otra vía.', [
            `tramo ${entry.idAsignacion}`,
          ]);
        }
      }

      if (entry.accion === 'CONSUMIR_NUEVO') {
        // Agregado nuevo: SIEMPRE PENDIENTE. Acreditar es del administrador.
        const sprint = await tx.sprint.findUniqueOrThrow({
          where: { idSprint: manifest.sprintId },
          select: { fechaInicio: true, fechaCierre: true },
        });
        const aggregate = await tx.horasParticipacion.create({
          data: {
            idParticipacion: entry.idParticipacion,
            idSprint: manifest.sprintId,
            // El período del agregado es el del propio Sprint: no se inventa
            // una ventana temporal que nadie registró.
            periodoInicio: sprint.fechaInicio,
            periodoFin: sprint.fechaCierre ?? sprint.fechaInicio,
            horasReportadas: entry.importeEsperado,
            horasCalculadas: entry.importeEsperado,
            estadoHoras: 'PENDIENTE',
          },
          select: { idRegistroHoras: true },
        });
        creado = aggregate.idRegistroHoras;
      }

      if (entry.accion === 'CONSUMIR_INCREMENTO') {
        const incremented = await tx.horasParticipacion.updateMany({
          where: {
            idRegistroHoras: entry.idRegistroHoras as number,
            estadoHoras: 'PENDIENTE',
          },
          data: {
            horasReportadas: { increment: entry.importeEsperado },
            horasCalculadas: { increment: entry.importeEsperado },
          },
        });
        if (incremented.count !== 1) {
          throw new LegacyDivergenceError('El agregado a incrementar cambió de estado.', [
            `agregado ${entry.idRegistroHoras}`,
          ]);
        }
        const marked = await tx.asignacionTarea.updateMany({
          where: { idAsignacion: entry.idAsignacion, reconocidoEn: null },
          data: { reconocidoEn: new Date() },
        });
        if (marked.count !== 1) {
          throw new LegacyDivergenceError('El tramo fue consumido por otra vía.', [
            `tramo ${entry.idAsignacion}`,
          ]);
        }
      }

      if (entry.accion === 'CLASIFICAR_REPORTE') {
        const reclassified = await tx.asignacionTarea.updateMany({
          where: { idAsignacion: entry.idAsignacion, origenReporte: tramo.origenReporte },
          data: { origenReporte: 'LEGACY' },
        });
        if (reclassified.count !== 1) {
          throw new LegacyDivergenceError('La procedencia del tramo cambió durante la aplicación.', [
            `tramo ${entry.idAsignacion}`,
          ]);
        }
      }

      const despues = await tx.asignacionTarea.findUniqueOrThrow({
        where: { idAsignacion: entry.idAsignacion },
        select: {
          idParticipacion: true,
          horasReales: true,
          reconocidoEn: true,
          origenReporte: true,
        },
      });

      // 5. Bitácora con antes, después y la huella del manifiesto.
      await audit.registrarEvento({
        tx,
        tipoEvento: TipoEventoBitacora.LEGACY_HOURS_RECONCILED,
        idActor: adminId,
        idProyecto: manifest.projectId,
        idSprint: manifest.sprintId,
        tipoEntidad: 'ASIGNACION_TAREA',
        idEntidad: entry.idAsignacion,
        valorAnterior: antes,
        valorNuevo: {
          accion: entry.accion,
          idParticipacion: despues.idParticipacion,
          horasReales: despues.horasReales === null ? null : despues.horasReales.toFixed(2),
          reconocido: despues.reconocidoEn !== null,
          origenReporte: despues.origenReporte,
          agregadoCreado: creado,
          manifestHash: hash,
        },
      });

      applied += 1;
      detalle.push({ idAsignacion: entry.idAsignacion, accion: entry.accion, efecto: 'APLICADO' });
    }

    return { applied, noop, detalle };
  });
}

export function formatRefusals(refusals: readonly LegacyRefusal[]): string {
  const lines = [`apply rechazado: ${refusals.length} entrada(s) no demostrables.`];
  for (const refusal of refusals) {
    lines.push(
      `  tramo ${refusal.idAsignacion} [${refusal.motivo}] ${refusal.detalle}` +
        (refusal.ids.length > 0 ? ` ids=${refusal.ids.join(',')}` : ''),
    );
  }
  lines.push('Ninguna fila fue modificada.');
  return lines.join('\n');
}

export async function runCli(argv: readonly string[]): Promise<number> {
  let options: LegacyCliOptions;
  try {
    options = parseArgs(argv);
  } catch (error) {
    if (error instanceof LegacyCliError && error.message === '__HELP__') {
      process.stdout.write(`${HELP_TEXT}\n`);
      return 0;
    }
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n\n${HELP_TEXT}\n`);
    return error instanceof LegacyCliError ? error.exitCode : 2;
  }

  const prisma = new PrismaClient();
  try {
    const admin = await resolveAdmin(prisma, options.adminId);
    process.stderr.write(
      `Actor: ${admin.nombre} ${admin.apellido} <${admin.correo}> (id ${admin.idUsuario})\n`,
    );

    switch (options.mode) {
      case 'diagnose': {
        const report = await diagnose(prisma, { projectId: options.projectId });
        process.stdout.write(
          options.json ? `${JSON.stringify(report, null, 2)}\n` : `${formatDiagnosis(report)}\n`,
        );
        return 0;
      }
      case 'apply': {
        const manifest = loadManifest(options.manifestPath as string);
        if (manifest.adminId !== options.adminId) {
          process.stderr.write(
            `El manifiesto fue revisado por el admin ${manifest.adminId}, no por ${options.adminId}.\n`,
          );
          return 5;
        }
        const refusals = await assessManifest(prisma, manifest);
        if (refusals.length > 0) {
          process.stderr.write(`${formatRefusals(refusals)}\n`);
          return 9;
        }
        const result = await applyManifest(prisma, manifest, options.adminId);
        process.stdout.write(
          options.json
            ? `${JSON.stringify(result, null, 2)}\n`
            : `Aplicadas ${result.applied} entrada(s), ${result.noop} sin efecto.\n`,
        );
        return 0;
      }
      case 'verify':
        process.stderr.write('El modo verify todavía no está implementado.\n');
        return 4;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    return error instanceof LegacyCliError ? error.exitCode : 1;
  } finally {
    await prisma.$disconnect();
  }
}

/* c8 ignore start -- arranque del proceso, no parte del contrato verificable */
if (process.argv[1] && process.argv[1].endsWith('sprint7-legacy.ts')) {
  void runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
/* c8 ignore stop */
