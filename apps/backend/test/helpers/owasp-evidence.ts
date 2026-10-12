import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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
 * La fase OWASP existe en dos linajes con el mismo contenido y distintos hashes:
 * el de su rama (`PHASE2_BASE..PHASE2_TIP`, el que citan los documentos de
 * evidencia) y el de `develop`, que la integró con los commits reescritos. La
 * correspondencia commit a commit (mismo patch-id, autor, fecha y mensaje; mismos
 * árboles en la base y en el cierre) está versionada en
 * `docs/security/owasp-phase-lineage.json` y la verifica `g08-phase-lineage.spec.ts`.
 */
export const PHASE2_DEVELOP_BASE = '23274e33da3b83f00651d2baa605b6e993e6c6a1';
export const PHASE2_DEVELOP_TIP = 'dd1a64f9c88e6fc349f34795e2e8d301e1db4d01';

export interface PhaseLineage {
  name: 'branch' | 'develop';
  base: string;
  head: string;
}

function isAncestorOfHead(sha: string): boolean {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', sha, 'HEAD'], { cwd: REPO_ROOT, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Rango que auditan las pruebas de evidencia: `base..head` de la fase, en el
 * linaje que contiene HEAD.
 *
 * Estas pruebas certifican la fase OWASP: un solo autor, sin merges, cada commit
 * trazable y ninguna ruta fuera de la lista. En su rama eso es `base..HEAD`. En
 * una rama que ya integró la fase y siguió (Sprint 9 con `develop`), `HEAD`
 * arrastra miles de commits ajenos a la fase: las pruebas dejaban de auditar la
 * fase y fallaban por lo integrado después. Cuando el cierre de la fase es
 * ancestro de HEAD se audita hasta ese cierre: la fase completa, y solo la fase.
 * Mientras la fase está en curso (su rama, antes del cierre) el extremo sigue
 * siendo HEAD. Ninguna aserción cambia.
 *
 * Decisión del propietario (2026-10-11). Lo posterior al cierre NO queda cubierto
 * por estas pruebas, incluidos cinco commits de mantenimiento de otro autor que
 * reutilizan identificadores de la fase (G01-C13, G05-C14, G07-C13, G07-C14 y
 * G08-C11): constan en la auditoría de GPI01, no en el índice de evidencia.
 */
export function phaseLineage(): PhaseLineage {
  if (isAncestorOfHead(PHASE2_DEVELOP_TIP)) {
    return { name: 'develop', base: PHASE2_DEVELOP_BASE, head: PHASE2_DEVELOP_TIP };
  }
  return { name: 'branch', base: PHASE2_BASE, head: isAncestorOfHead(PHASE2_TIP) ? PHASE2_TIP : 'HEAD' };
}

export function phaseBase(): string {
  return phaseLineage().base;
}

export function phaseHead(): string {
  return phaseLineage().head;
}

export interface LineageCommit {
  id: string;
  branch: string;
  develop: string;
  patchId: string;
}

export interface LineageMap {
  version: number;
  branch: { base: string; tip: string };
  develop: { base: string; tip: string };
  tree: { base: string; tip: string };
  commits: LineageCommit[];
}

export function lineageMap(): LineageMap {
  return JSON.parse(readFileSync(join(REPO_ROOT, 'docs/security/owasp-phase-lineage.json'), 'utf8')) as LineageMap;
}

/**
 * SHA que debe tener en el historial local el commit que un documento de
 * evidencia cita como `documented` (hash de la rama auditada). En el linaje de
 * la rama es ese mismo hash; en el de `develop`, su par del mapa versionado.
 * Un hash que el mapa no conoce no se traduce: la comparación falla.
 */
export function shaInLineage(documented: string): string | undefined {
  if (phaseLineage().name === 'branch') {
    return documented;
  }
  return lineageMap().commits.find((commit) => commit.branch.startsWith(documented))?.develop;
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
    execFileSync('git', ['cat-file', '-e', `${phaseBase()}^{commit}`], { cwd: REPO_ROOT, stdio: 'ignore' });
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
    git('log', '--fixed-strings', `--grep=${TRACE_GREP}`, '--format=%H%x00%B%x1e', `${phaseBase()}..${phaseHead()}`),
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
