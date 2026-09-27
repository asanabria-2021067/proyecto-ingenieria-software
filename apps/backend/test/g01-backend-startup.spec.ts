import { describe, expect, it } from 'vitest';
import { readRepoFile } from './helpers/workflow-yaml';

/**
 * G01-C09 · OWASP25-C029. El CMD productivo del backend solo aplica
 * migraciones y arranca la aplicación: sin seed de datos demo y sin rutas que
 * silencien un fallo (`|| echo`, `|| true`). Un fixture demuestra que el guard
 * detecta el CMD anterior.
 */

/** Último CMD del Dockerfile (el de la etapa final). */
export function finalCmd(dockerfile: string): string {
  const commands = dockerfile.split('\n').filter((line) => /^\s*CMD\s/.test(line));
  return (commands.at(-1) ?? '').replace(/^\s*CMD\s+/, '').trim();
}

export function startupFindings(cmd: string): string[] {
  const findings: string[] = [];
  if (/\bseed\b/i.test(cmd)) {
    findings.push('seed-en-arranque');
  }
  if (/\|\||;/.test(cmd) || /\becho\b|\btrue\b/.test(cmd)) {
    findings.push('fallo-silenciado');
  }
  const migrate = cmd.indexOf('npx prisma migrate deploy');
  const start = cmd.indexOf('node dist/main.js');
  if (migrate < 0 || start < 0 || start < migrate || !/migrate deploy\s*&&/.test(cmd)) {
    findings.push('etapas-criticas-no-encadenadas');
  }
  return findings;
}

describe('G01-C09: arranque productivo sin seed', () => {
  it('el CMD real solo migra y arranca, fallando si la migración falla', () => {
    const cmd = finalCmd(readRepoFile('apps/backend/Dockerfile'));
    expect(cmd).toBe('npx prisma migrate deploy && node dist/main.js');
    expect(startupFindings(cmd)).toEqual([]);
  });

  it('fixture: el CMD anterior con seed y `|| echo` es rechazado', () => {
    const legacy =
      'npx prisma migrate deploy && (npx prisma db seed || echo "Seed skipped: data already exists") && node dist/main.js';
    expect(startupFindings(legacy)).toEqual(['seed-en-arranque', 'fallo-silenciado']);
  });

  it('fixture: arrancar aunque la migración falle o sin migrar es rechazado', () => {
    expect(startupFindings('npx prisma migrate deploy || true; node dist/main.js')).toContain('fallo-silenciado');
    expect(startupFindings('node dist/main.js')).toEqual(['etapas-criticas-no-encadenadas']);
  });
});
