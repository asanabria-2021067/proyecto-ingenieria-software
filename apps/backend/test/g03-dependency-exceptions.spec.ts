import { describe, expect, it } from 'vitest';
import { readRepoFile } from './helpers/workflow-yaml';

/**
 * G03-C11 · OWASP25-C040/C046. Guard del registro de excepciones de
 * dependencias: el riesgo conocido es explícito, tiene dueño y caduca. Una
 * excepción vencida, demasiado larga, incompleta u obsoleta (el lockfile ya
 * tiene la versión que corrige) hace fallar este test en CI.
 */

const REGISTRY = 'docs/security/dependency-exceptions.md';
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAYS = 180;
const MAX_DAYS_CRITICAL_PROD = 30;
const SEVERITIES = ['low', 'moderate', 'high', 'critical'];
const APPS = ['backend', 'frontend'];
const SCOPES = ['produccion', 'desarrollo'];

export interface DependencyException {
  paquete: string;
  app: string;
  advisories: string[];
  severidad: string;
  alcance: string;
  corrigeEn: string;
  justificacion: string;
  owner: string;
  caduca: string;
}

export function parseExceptions(markdown: string): DependencyException[] {
  const block = /<!-- exceptions:start -->([\s\S]*?)<!-- exceptions:end -->/.exec(markdown);
  if (!block) {
    throw new Error('El registro no tiene el bloque de excepciones');
  }
  return block[1]
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .slice(2)
    .map((line) => {
      const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
      const [paquete, app, advisories, severidad, alcance, corrigeEn, justificacion, owner, caduca] = cells;
      return {
        paquete,
        app,
        advisories: (advisories ?? '').split(',').map((id) => id.trim()).filter(Boolean),
        severidad,
        alcance,
        corrigeEn,
        justificacion,
        owner,
        caduca,
      };
    });
}

export function compareVersions(a: string, b: string): number {
  const left = a.split('-')[0].split('.').map(Number);
  const right = b.split('-')[0].split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

/** lockedVersion(app, paquete) = versión raíz del lockfile de esa app, o null si ya no está. */
export function exceptionFindings(
  exceptions: DependencyException[],
  today: Date,
  lockedVersion: (app: string, paquete: string) => string | null,
): string[] {
  const findings: string[] = [];
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  for (const exception of exceptions) {
    const id = `${exception.app}:${exception.paquete}`;
    if (
      !exception.paquete ||
      !APPS.includes(exception.app) ||
      !SEVERITIES.includes(exception.severidad) ||
      !SCOPES.includes(exception.alcance) ||
      !exception.justificacion ||
      !exception.owner ||
      !/^\d+\.\d+\.\d+$/.test(exception.corrigeEn ?? '')
    ) {
      findings.push(`${id}:incompleta`);
      continue;
    }
    if (exception.advisories.length === 0 || exception.advisories.some((advisory) => !/^GHSA(-[a-z0-9]{4}){3}$|^CVE-\d{4}-\d{4,}$/.test(advisory))) {
      findings.push(`${id}:advisory-invalido`);
    }
    const expiry = /^\d{4}-\d{2}-\d{2}$/.test(exception.caduca) ? Date.parse(`${exception.caduca}T00:00:00Z`) : NaN;
    if (Number.isNaN(expiry)) {
      findings.push(`${id}:caducidad-invalida`);
    } else {
      const maxDays = exception.severidad === 'critical' && exception.alcance === 'produccion' ? MAX_DAYS_CRITICAL_PROD : MAX_DAYS;
      if (expiry < todayUtc) {
        findings.push(`${id}:vencida`);
      } else if (expiry - todayUtc > maxDays * DAY_MS) {
        findings.push(`${id}:caducidad-mayor-a-${maxDays}-dias`);
      }
    }
    const locked = lockedVersion(exception.app, exception.paquete);
    if (locked === null || compareVersions(locked, exception.corrigeEn) >= 0) {
      findings.push(`${id}:obsoleta`);
    }
  }
  return findings;
}

const lockfiles: Record<string, { packages: Record<string, { version?: string }> }> = Object.fromEntries(
  APPS.map((app) => [app, JSON.parse(readRepoFile(`apps/${app}/package-lock.json`))]),
);
const lockedInRepo = (app: string, paquete: string) =>
  lockfiles[app]?.packages[`node_modules/${paquete}`]?.version ?? null;

const base: DependencyException = {
  paquete: 'pkg',
  app: 'backend',
  advisories: ['GHSA-aaaa-bbbb-cccc'],
  severidad: 'high',
  alcance: 'desarrollo',
  corrigeEn: '2.0.0',
  justificacion: 'x',
  owner: 'Vernel',
  caduca: '2026-10-31',
};
const TODAY = new Date('2026-09-27T12:00:00Z');
const vulnerable = () => '1.0.0';

describe('G03-C11: registro de excepciones de dependencias con caducidad', () => {
  const exceptions = parseExceptions(readRepoFile(REGISTRY));

  it('el registro tiene excepciones y cada una está vigente, completa y aún es necesaria', () => {
    expect(exceptions.length).toBeGreaterThan(0);
    expect(exceptionFindings(exceptions, new Date(), lockedInRepo)).toEqual([]);
  });

  it('no hay excepciones de severidad critical en producción', () => {
    expect(exceptions.filter((e) => e.severidad === 'critical' && e.alcance === 'produccion')).toEqual([]);
  });

  describe('fixtures negativos', () => {
    it('una excepción vencida hace fallar el guard', () => {
      expect(exceptionFindings([{ ...base, caduca: '2026-09-26' }], TODAY, vulnerable)).toEqual(['backend:pkg:vencida']);
    });

    it('vence el mismo día: todavía vigente; al día siguiente, vencida', () => {
      expect(exceptionFindings([{ ...base, caduca: '2026-09-27' }], TODAY, vulnerable)).toEqual([]);
      expect(exceptionFindings([{ ...base, caduca: '2026-09-27' }], new Date('2026-09-28T00:00:01Z'), vulnerable)).toEqual([
        'backend:pkg:vencida',
      ]);
    });

    it('caducidad lejana: más de 180 días, o más de 30 si es critical en producción', () => {
      expect(exceptionFindings([{ ...base, caduca: '2027-06-01' }], TODAY, vulnerable)).toEqual([
        'backend:pkg:caducidad-mayor-a-180-dias',
      ]);
      expect(
        exceptionFindings([{ ...base, severidad: 'critical', alcance: 'produccion', caduca: '2026-11-30' }], TODAY, vulnerable),
      ).toEqual(['backend:pkg:caducidad-mayor-a-30-dias']);
    });

    it('obsoleta: el lockfile ya tiene la versión que corrige, o el paquete ya no está', () => {
      expect(exceptionFindings([base], TODAY, () => '2.0.0')).toEqual(['backend:pkg:obsoleta']);
      expect(exceptionFindings([base], TODAY, () => null)).toEqual(['backend:pkg:obsoleta']);
    });

    it('incompleta o con advisory inválido', () => {
      expect(exceptionFindings([{ ...base, owner: '' }], TODAY, vulnerable)).toEqual(['backend:pkg:incompleta']);
      expect(exceptionFindings([{ ...base, advisories: ['ver-issue-12'] }], TODAY, vulnerable)).toEqual([
        'backend:pkg:advisory-invalido',
      ]);
      expect(exceptionFindings([{ ...base, caduca: 'pronto' }], TODAY, vulnerable)).toEqual(['backend:pkg:caducidad-invalida']);
    });
  });
});
