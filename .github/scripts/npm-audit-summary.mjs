#!/usr/bin/env node
/**
 * Resumen INFORMATIVO de `npm audit --omit=dev` por app (G03-C02 · OWASP25-C040).
 *
 *   node .github/scripts/npm-audit-summary.mjs apps/backend apps/frontend
 *
 * - Audita solo dependencias de producción a partir del lockfile (no instala nada).
 * - Publica conteos por severidad y, por paquete, severidad, si es directo, si
 *   hay fix y los IDs GHSA. Nunca reenvía stderr de npm ni campos libres del
 *   registry: todo texto pasa por `redact` antes de imprimirse.
 * - Siempre termina en 0: el bloqueo de dependencias NUEVAS lo hace el job
 *   dependency-review; aquí solo se hace visible el backlog histórico.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const SEVERITIES = ['critical', 'high', 'moderate', 'low', 'info'];

const CREDENTIAL_PATTERNS = [
  /(\/\/)[^/\s:@]+:[^/\s@]+@/g, // credenciales en URL (//user:pass@host)
  /(_auth(?:Token)?\s*=\s*)\S+/gi, // líneas de .npmrc
  /\b(?:npm_[A-Za-z0-9]{36}|gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/g,
  /(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi,
];

export function redact(text) {
  return CREDENTIAL_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, (_match, prefix) => `${typeof prefix === 'string' ? prefix : ''}[REDACTED]`),
    String(text),
  );
}

function advisoryIds(vulnerability) {
  const ids = new Set();
  for (const via of vulnerability.via ?? []) {
    const match = typeof via === 'object' && /GHSA(?:-[a-z0-9]{4}){3}/.exec(via.url ?? '');
    if (match) {
      ids.add(match[0]);
    }
  }
  return [...ids].sort();
}

function describeFix(fixAvailable) {
  if (fixAvailable === true) {
    return 'sí';
  }
  if (fixAvailable && typeof fixAvailable === 'object') {
    return fixAvailable.isSemVerMajor ? `major (${fixAvailable.name}@${fixAvailable.version})` : `${fixAvailable.name}@${fixAvailable.version}`;
  }
  return 'no';
}

/** report = JSON de `npm audit --json`, o null si npm no produjo un reporte legible. */
export function summarizeAudit(app, report) {
  const lines = [`### npm audit --omit=dev · ${app}`, ''];
  const counts = report?.metadata?.vulnerabilities;
  if (!counts) {
    lines.push('Reporte no disponible (npm audit no devolvió JSON legible). Informativo: no bloquea.');
    return redact(lines.join('\n'));
  }
  lines.push(`| ${SEVERITIES.join(' | ')} | total |`, `|${' --- |'.repeat(SEVERITIES.length + 1)}`);
  lines.push(`| ${SEVERITIES.map((severity) => counts[severity] ?? 0).join(' | ')} | ${counts.total ?? 0} |`, '');
  const packages = Object.values(report.vulnerabilities ?? {}).sort(
    (a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || a.name.localeCompare(b.name),
  );
  if (packages.length > 0) {
    lines.push('| paquete | severidad | directo | fix | advisories |', '| --- | --- | --- | --- | --- |');
    for (const vulnerability of packages) {
      lines.push(
        `| ${vulnerability.name} | ${vulnerability.severity} | ${vulnerability.isDirect ? 'sí' : 'no'} | ${describeFix(vulnerability.fixAvailable)} | ${advisoryIds(vulnerability).join(', ') || '—'} |`,
      );
    }
  }
  return redact(lines.join('\n'));
}

function auditApp(directory) {
  // stderr se descarta: puede incluir la configuración del registry.
  const result = spawnSync('npm', ['audit', '--omit=dev', '--json'], {
    cwd: directory,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 64 * 1024 * 1024,
  });
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const summary = process.argv
    .slice(2)
    .map((directory) => summarizeAudit(directory, auditApp(directory)))
    .join('\n\n');
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  }
}
