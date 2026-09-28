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

export const STATES = ['IMPLEMENTED', 'PASS', 'SKIPPED_BY_PREFLIGHT', 'RESIDUAL_CODE_RISK', 'OUT_OF_SCOPE_ADMIN_HANDOFF', 'NOT_APPLICABLE'];
export const CATEGORIES = ['A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09', 'A10'];
export const TRACE = /Security\/integration contract: Gate (G0\d) · Commit (G0\d-C\d{2})/;

export function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

export function gitAvailable(): boolean {
  try {
    execFileSync('git', ['cat-file', '-e', `${PHASE2_BASE}^{commit}`], { cwd: REPO_ROOT, stdio: 'ignore' });
    return git('rev-parse', '--is-shallow-repository') === 'false';
  } catch {
    return false;
  }
}

/** ID `Gxx-Cnn` → SHA completo, para los commits trazables de la fase según el historial local. */
export function historyCommitIds(): Map<string, string> {
  const log = git('log', '--format=%H%x00%B%x1e', `${PHASE2_BASE}..HEAD`);
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
