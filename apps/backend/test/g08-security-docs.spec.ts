import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, readRepoFile } from './helpers/workflow-yaml';
import {
  CATEGORIES,
  STATES,
  citedSpecs,
  gitAvailable,
  historyCommitIds,
  listFiles,
  sensitiveFindings,
  specExists,
  tableRows,
} from './helpers/owasp-evidence';

/**
 * G08-C01 · OWASP25-C048 + T-273 (A01–A10). La documentación de seguridad
 * versionada (`docs/security/**`) es evidencia pública del repositorio: nunca
 * puede llevar secretos, tokens, cookies, direcciones IP, correos, rutas
 * internas del servidor ni comandos privilegiados. La matriz OWASP 2025 cubre
 * A01–A10 con estados del catálogo y solo cita tests y commits que existen.
 */

describe('G08-C01: documentación de seguridad saneada', () => {
  it('ningún archivo de docs/security contiene datos sensibles', () => {
    const findings = listFiles(join(REPO_ROOT, 'docs/security')).flatMap((file) =>
      sensitiveFindings(readFileSync(file, 'utf8')).map((kind) => `${file.slice(REPO_ROOT.length + 1)}:${kind}`),
    );
    expect(findings).toEqual([]);
  });

  it.each([
    ['ipv4', 'la API vive en 10.20.30.40'],
    ['correo', 'contacto: persona@ejemplo.org'],
    ['jwt', 'token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjF9.firma'],
    ['token-github', `ghp_${'a'.repeat(36)}`],
    ['clave-privada', '-----BEGIN OPENSSH PRIVATE KEY-----'],
    ['bearer', 'Authorization: Bearer abcdefghijklmnopqrstu'],
    ['valor-de-cookie', 'access_token=abc123'],
    ['asignacion-de-secreto', 'password: SuperClave99'],
    ['comando-privilegiado', 'ejecutar `sudo systemctl reload nginx`'],
    ['host-productivo', 'https://servidor.nip.io/'],
    ['ruta-interna', 'certificado en /etc/letsencrypt/live/x/'],
  ])('fixture: %s se detecta', (kind, sample) => {
    expect(sensitiveFindings(sample)).toContain(kind);
  });

  it('los valores genéricos de bind y los nombres de variables no son hallazgos', () => {
    expect(sensitiveFindings('BACKEND_BIND admite 0.0.0.0 o 127.0.0.1; COOKIE_SECURE y JWT_SECRET son nombres')).toEqual([]);
  });
});

describe('G08-C01: matriz OWASP 2025 del alcance de código', () => {
  const matrix = readRepoFile('docs/security/owasp-top10-2025.md');

  it('el resumen cubre A01–A10 exactamente una vez, con un estado del catálogo', () => {
    const rows = tableRows(matrix, 'Resumen A01–A10');
    expect(rows.map((row) => row[0].slice(0, 3))).toEqual(CATEGORIES);
    for (const row of rows) {
      expect(STATES).toContain(row[2]);
    }
  });

  it('cada control de la Fase 2 tiene gate, evidencia y un estado del catálogo', () => {
    const rows = tableRows(matrix, 'Controles de la Fase 2');
    expect(rows.length).toBeGreaterThan(30);
    for (const row of rows) {
      expect(row[3], row[0]).toMatch(/G0\d/);
      expect(row[5].length, row[0]).toBeGreaterThan(0);
      expect(STATES, row[0]).toContain(row[6]);
    }
  });

  it('una operación externa nunca figura como ejecutada', () => {
    for (const row of tableRows(matrix, 'Controles de la Fase 2')) {
      expect(row[7], row[0]).not.toMatch(/\b(PASS|EXECUTED|DONE)\b/);
    }
  });

  it('cada test citado existe en el repositorio', () => {
    expect(citedSpecs(matrix).filter((name) => !specExists(name))).toEqual([]);
  });

  it.runIf(gitAvailable())('cada commit citado existe en el historial local (los de G08 pueden estar en curso)', () => {
    const ids = historyCommitIds();
    const cited = [...new Set([...matrix.matchAll(/\bG0\d-C\d{2}\b/g)].map((match) => match[0]))];
    // G02-C03 solo se cita como operación NO ejecutada (Gate Admin); nunca debe existir como commit.
    expect(cited.filter((id) => !ids.has(id) && !id.startsWith('G08-') && id !== 'G02-C03')).toEqual([]);
    expect(ids.has('G02-C03')).toBe(false);
  });
});
