#!/usr/bin/env node
/**
 * Guard de representatividad del arnés (G02-C17 · D4 + OWASP25-C047).
 *
 * La configuración nginx del arnés (infra/staging/nginx) solo puede diferir
 * del baseline productivo versionado (infra/nginx) por las sustituciones
 * declaradas en substitutions.json, cada una aplicada exactamente una vez.
 * Cualquier otra diferencia (una cabecera, un location, un upstream) falla.
 *
 * Uso: node infra/staging/check-representativity.mjs   (sale con 0 o 1)
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const STAGING_DIR = dirname(fileURLToPath(import.meta.url));
export const BASELINE_DIR = join(STAGING_DIR, '..', 'nginx');
export const HARNESS_NGINX_DIR = join(STAGING_DIR, 'nginx');
export const HARNESS_FILES = ['nginx.conf', 'sites-enabled/uvg-collab'];

export function loadSubstitutions() {
  return JSON.parse(readFileSync(join(STAGING_DIR, 'substitutions.json'), 'utf8')).substitutions;
}

function countOccurrences(text, fragment) {
  return text.split(fragment).length - 1;
}

/**
 * Deshace las sustituciones declaradas sobre la copia del arnés y la compara
 * con el baseline. Devuelve la lista de hallazgos (vacía = representativo).
 */
export function representativityFindings(file, harnessText, baselineText, substitutions) {
  const findings = [];
  let restored = harnessText;
  for (const substitution of substitutions.filter((s) => s.file === file)) {
    const inHarness = countOccurrences(restored, substitution.to);
    const inBaseline = countOccurrences(baselineText, substitution.from);
    if (inHarness !== 1 || inBaseline !== 1) {
      findings.push(`${file}: sustitucion no aplicada exactamente una vez (${JSON.stringify(substitution.from)})`);
      continue;
    }
    restored = restored.replace(substitution.to, substitution.from);
  }
  const restoredLines = restored.split('\n');
  const baselineLines = baselineText.split('\n');
  const length = Math.max(restoredLines.length, baselineLines.length);
  for (let i = 0; i < length; i += 1) {
    if (restoredLines[i] !== baselineLines[i]) {
      findings.push(
        `${file}: diferencia no declarada en linea ${i + 1}: arnes=${JSON.stringify(restoredLines[i] ?? null)} baseline=${JSON.stringify(baselineLines[i] ?? null)}`,
      );
    }
  }
  return findings;
}

export function checkAll() {
  const substitutions = loadSubstitutions();
  return HARNESS_FILES.flatMap((file) =>
    representativityFindings(
      file,
      readFileSync(join(HARNESS_NGINX_DIR, file), 'utf8'),
      readFileSync(join(BASELINE_DIR, file), 'utf8'),
      substitutions,
    ),
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const findings = checkAll();
  if (findings.length > 0) {
    console.log('FAIL: la configuracion nginx del arnes no es representativa del baseline');
    findings.forEach((finding) => console.log(`- ${finding}`));
    process.exitCode = 1;
  } else {
    console.log('PASS: el arnes solo difiere de infra/nginx por las sustituciones declaradas');
  }
}
