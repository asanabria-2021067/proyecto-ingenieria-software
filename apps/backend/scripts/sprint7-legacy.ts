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
import { PrismaClient } from '@prisma/client';

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
      case 'apply':
        process.stderr.write('El modo apply todavía no está implementado.\n');
        return 4;
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
