import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { PROJECT_LOCK_TIMEOUT } from '../src/common/project-policy/project-transaction.service';

/**
 * G07-C10 · OWASP25-C007 (A05:2025). Guarda de superficie del SQL crudo en el
 * código que corre en producción (`src/`). Prisma parametriza todo lo que
 * pasa por el cliente tipado, `$queryRaw`/`$executeRaw` con plantilla
 * etiquetada y `Prisma.sql`; lo único que concatena texto en la sentencia son
 * `$executeRawUnsafe`, `$queryRawUnsafe` y `Prisma.raw`. Hoy existe UN uso, con
 * una constante del propio código. Cualquier uso nuevo hace fallar este test:
 * quien lo agregue debe justificarlo aquí. No sustituye los tests de
 * comportamiento de cada consulta.
 */

const SRC = join(__dirname, '../src');
export const RAW_SQL_PATTERN = /\$executeRawUnsafe\b|\$queryRawUnsafe\b|\bPrisma\.raw\s*\(/g;

export const RAW_SQL_ALLOWLIST: ReadonlyArray<{ file: string; code: string; reason: string }> = [
  {
    file: 'common/project-policy/project-transaction.service.ts',
    code: "await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '${PROJECT_LOCK_TIMEOUT}'`);",
    reason: '`SET LOCAL` no admite parámetros ($1); el único valor interpolado es la constante PROJECT_LOCK_TIMEOUT del propio módulo.',
  },
];

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      return listSourceFiles(fullPath);
    }
    return /\.(ts|js)$/.test(entry.name) ? [fullPath] : [];
  });
}

/** Cada aparición como `archivo: línea recortada`, para comparar contra la allowlist. */
export function rawSqlUsages(files: Record<string, string>): string[] {
  const usages: string[] = [];
  for (const [file, source] of Object.entries(files)) {
    source.split('\n').forEach((line) => {
      if (line.match(RAW_SQL_PATTERN)) {
        usages.push(`${file}: ${line.trim()}`);
      }
    });
  }
  return usages.sort();
}

export function rawSqlFindings(files: Record<string, string>): string[] {
  const allowed = RAW_SQL_ALLOWLIST.map(({ file, code }) => `${file}: ${code}`);
  return rawSqlUsages(files).filter((usage) => !allowed.includes(usage));
}

function sourceTree(): Record<string, string> {
  return Object.fromEntries(listSourceFiles(SRC).map((file) => [relative(SRC, file), readFileSync(file, 'utf8')]));
}

describe('G07-C10: guarda de SQL crudo', () => {
  it('src/ contiene exactamente los usos de la allowlist, ni uno más', () => {
    expect(rawSqlUsages(sourceTree())).toEqual(RAW_SQL_ALLOWLIST.map(({ file, code }) => `${file}: ${code}`));
  });

  it('el único valor interpolado es una constante del código con formato de duración', () => {
    expect(PROJECT_LOCK_TIMEOUT).toMatch(/^\d+(ms|s)$/);
    const source = readFileSync(join(SRC, RAW_SQL_ALLOWLIST[0].file), 'utf8');
    expect(source).toMatch(/^export const PROJECT_LOCK_TIMEOUT = '\d+(ms|s)';$/m);
    const interpolations = RAW_SQL_ALLOWLIST[0].code.match(/\$\{[^}]+\}/g);
    expect(interpolations).toEqual(['${PROJECT_LOCK_TIMEOUT}']);
  });

  it.each([
    ['$executeRawUnsafe nuevo', 'await this.prisma.$executeRawUnsafe(`DELETE FROM tarea WHERE id_tarea = ${id}`);'],
    ['$queryRawUnsafe nuevo', 'const filas = await this.prisma.$queryRawUnsafe(sql);'],
    ['Prisma.raw nuevo', 'const orden = Prisma.raw(query.orden);'],
    ['la misma sentencia permitida en otro archivo', "await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '${PROJECT_LOCK_TIMEOUT}'`);"],
  ])('fixture: %s se detecta', (_caso, line) => {
    const files = { ...sourceTree(), 'fixtures/nuevo.service.ts': `export async function f() {\n  ${line}\n}\n` };
    expect(rawSqlFindings(files)).toEqual([`fixtures/nuevo.service.ts: ${line}`]);
  });

  it('fixture: las consultas parametrizadas no se marcan', () => {
    const files = {
      'fixtures/seguro.service.ts': [
        'await this.prisma.$queryRaw(Prisma.sql`SELECT 1 WHERE id = ${id}`);',
        'await tx.$executeRaw`UPDATE tarea SET x = ${valor}`;',
      ].join('\n'),
    };
    expect(rawSqlFindings(files)).toEqual([]);
  });
});
