import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './workflow-yaml';

/**
 * G08 (OWASP25-C048 · T-273): utilidades compartidas por los tests de
 * evidencia de la workstream OWASP. Solo leen el repositorio y el historial
 * Git local; en un clon superficial (CI sin historial) las comprobaciones que
 * dependen del historial se omiten y las cubre el job OWASP_DELTA_ISOLATED.
 */

/** BASE_SHA_PHASE2_CODE: padre local del primer commit de G01 (79230ea7). */
export const PHASE2_BASE = '0a723a8d93b640f6077c801d9a0ad5a7b59cbef3';

/** Último commit de la fase OWASP en su rama (`sprint8/vernel-owasp2025`), cerrada y auditada con 99 commits. */
export const PHASE2_TIP = '6c9574d1888422de75b39b2778bc5e38658005df';

/**
 * Extremo del rango que auditan las pruebas de evidencia: `PHASE2_BASE..phaseHead()`.
 *
 * Estas pruebas certifican la fase OWASP: un solo autor, sin merges, cada commit
 * trazable y ninguna ruta fuera de la lista. En su rama eso es `base..HEAD`. En
 * una rama que ya integró la fase y siguió (Sprint 9 con `develop`), `HEAD`
 * arrastra miles de commits ajenos a la fase y el historial duplicado de
 * `develop`: las pruebas dejaban de auditar la fase y fallaban por lo integrado
 * después. Cuando el cierre de la fase es ancestro de HEAD se audita hasta ese
 * cierre: la fase completa, y solo la fase. Mientras la fase está en curso (su
 * rama, antes del cierre) el extremo sigue siendo HEAD. Ninguna aserción cambia.
 *
 * Decisión del propietario (2026-10-11). Lo posterior al cierre NO queda cubierto
 * por estas pruebas, incluidos cinco commits de mantenimiento de otro autor que
 * reutilizan identificadores de la fase (G01-C13, G05-C14, G07-C13, G07-C14 y
 * G08-C11): constan en la auditoría de GPI01, no en el índice de evidencia.
 */
export function phaseHead(): string {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', PHASE2_TIP, 'HEAD'], { cwd: REPO_ROOT, stdio: 'ignore' });
    return PHASE2_TIP;
  } catch {
    return 'HEAD';
  }
}

export const STATES =['IMPLEMENTED', 'PASS', 'SKIPPED_BY_PREFLIGHT', 'RESIDUAL_CODE_RISK', 'OUT_OF_SCOPE_ADMIN_HANDOFF', 'NOT_APPLICABLE'];
export const CATEGORIES = ['A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09', 'A10'];
export const TRACE = /Security\/integration contract: Gate (G0\d) · Commit (G0\d-C\d{2})/;

/**
 * GPI01-C11: tope de salida de un comando de historial. El valor por defecto de
 * Node (1 MiB) dejó de alcanzar cuando la rama integró `develop`: el rango de la
 * fase pasó de ~100 a miles de commits y `spawnSync git ENOBUFS` reventaba la
 * prueba ANTES de evaluar ninguna aserción. 64 MiB cubre con margen cualquier
 * listado de este repositorio y sigue siendo un tope: una salida mayor falla.
 */
export const GIT_MAX_BUFFER = 64 * 1024 * 1024;

export function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: GIT_MAX_BUFFER }).trim();
}

/** Texto fijo de la línea de trazabilidad; lo usa `git log --grep` para acotar en origen. */
export const TRACE_GREP = 'Security/integration contract: Gate G0';

export function gitAvailable(): boolean {
  try {
    execFileSync('git', ['cat-file', '-e', `${PHASE2_BASE}^{commit}`], { cwd: REPO_ROOT, stdio: 'ignore' });
    return git('rev-parse', '--is-shallow-repository') === 'false';
  } catch {
    return false;
  }
}

/** Interpreta la salida de `git log --format=%H%x00%B%x1e`: ID `Gxx-Cnn` → SHA de cada commit trazable. */
export function parseTraceLog(log: string): Map<string, string> {
  const ids = new Map<string, string>();
  for (const entry of log.split('\x1e')) {
    const [sha, body] = entry.trim().split('\x00');
    const id = TRACE.exec(body ?? '')?.[2];
    if (sha && id) {
      ids.set(id, sha);
    }
  }
  return ids;
}

/** ID `Gxx-Cnn` → SHA completo, para los commits trazables de la fase según el historial local. */
export function historyCommitIds(): Map<string, string> {
  // GPI01-C11: se acota en origen. Solo los commits con la línea de
  // trazabilidad pueden aportar un ID, así que pedirle a git únicamente esos
  // (`--grep`, texto fijo) devuelve el mismo mapa sin traer el cuerpo de todo
  // el historial. El filtro exacto sigue siendo TRACE, en `parseTraceLog`.
  return parseTraceLog(
    git('log', '--fixed-strings', `--grep=${TRACE_GREP}`, '--format=%H%x00%B%x1e', `${PHASE2_BASE}..${phaseHead()}`),
  );
}

/** Patrones que nunca pueden aparecer en la documentación versionada de seguridad. */
export const SENSITIVE_PATTERNS: Array<[string, RegExp]> = [
  ['ipv4', /\b(?!127\.0\.0\.1\b)(?!0\.0\.0\.0\b)(?:\d{1,3}\.){3}\d{1,3}\b/],
  ['correo', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/],
  ['jwt', /\beyJ[A-Za-z0-9_-]{10,}\./],
  ['token-github', /\b(?:ghp|gho|ghs|ghu)_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/],
  ['clave-aws', /\bAKIA[0-9A-Z]{16}\b/],
  ['clave-privada', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['bearer', /\bBearer\s+[A-Za-z0-9._~+/-]{16,}/],
  ['valor-de-cookie', /\b(?:access_token|refresh_token)=[^\s;`|]+/],
  ['asignacion-de-secreto', /\b(?:password|contrasena|secret|api_key)\s*[:=]\s*['"]?[^\s'"`|]{6,}/i],
  ['comando-privilegiado', /(?:^|\s|`)(?:sudo|ssh)\s+[-\w@]/m],
  ['host-productivo', /\bnip\.io\b/i],
  ['ruta-interna', /\/(?:etc\/letsencrypt|srv\/[\w-]+|home\/[\w.-]+)\//],
];

export function sensitiveFindings(source: string): string[] {
  return SENSITIVE_PATTERNS.filter(([, pattern]) => pattern.test(source)).map(([name]) => name);
}

export function listFiles(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

const SPEC_NAME = /`((?:[\w.-]+\/)*[\w.-]+\.spec\.tsx?)`/g;
const TEST_ROOTS = ['apps/backend/test', 'apps/frontend/test', 'apps/frontend/e2e', 'apps/frontend/e2e-harness'];

export function citedSpecs(source: string): string[] {
  return [...new Set([...source.matchAll(SPEC_NAME)].map((match) => match[1]))];
}

export function specExists(name: string): boolean {
  const base = name.split('/').pop() as string;
  return TEST_ROOTS.some((root) => listFiles(join(REPO_ROOT, root)).some((file) => file.endsWith(`/${base}`)));
}

/** Filas (celdas recortadas) de la primera tabla bajo el encabezado `## <heading>`. */
export function tableRows(source: string, heading: string): string[][] {
  const section = source.split(/^## /m).find((block) => block.startsWith(heading)) ?? '';
  const lines = section.split('\n');
  const start = lines.findIndex((line) => line.startsWith('|'));
  if (start === -1) {
    return [];
  }
  const table: string[] = [];
  for (const line of lines.slice(start)) {
    if (!line.startsWith('|')) break;
    table.push(line);
  }
  return table
    .filter((line) => !/^\|\s*:?-/.test(line))
    .slice(1)
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));
}
