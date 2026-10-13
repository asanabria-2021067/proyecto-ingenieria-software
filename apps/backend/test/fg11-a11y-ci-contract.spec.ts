import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT, loadWorkflow, parseWorkflow, readRepoFile, type WorkflowJob, type WorkflowStep } from './helpers/workflow-yaml';

/**
 * FG11-C03 (T-318). La comprobación de accesibilidad con axe forma parte de la
 * suite E2E que CI ejecuta, corre en un paso propio y es bloqueante.
 *
 * Esto verifica el workflow y su cableado. Que GitHub Actions lo ejecutó de
 * verdad solo se puede comprobar en una corrida real del pipeline.
 */

const PASO_A11Y = 'Accesibilidad con axe (cinco pantallas, claro y oscuro)';
const PASO_SUITE = 'Ejecutar suite de humo E2E';

// FASE-CI01: la suite ahora corre en 3 shards (matriz `shardIndex`); axe solo
// debe correr una vez, así que el paso puede estar condicionado EXACTAMENTE a
// "es el shard 1" — ninguna otra condición (ni siquiera parecida) es
// aceptable, para que esto no se convierta en una puerta trasera.
const CONDICION_AXE_PERMITIDA = 'matrix.shardIndex == 1';

type PasoCompleto = WorkflowStep & { if?: string; 'continue-on-error'?: boolean | string; 'working-directory'?: string };

/** Razones por las que el job NO impone la comprobación de accesibilidad. Vacío = la impone. */
export function a11yGateFindings(job: WorkflowJob): string[] {
  const pasos = (job.steps ?? []) as PasoCompleto[];
  const nombres = pasos.map((paso) => paso.name ?? '');
  const hallazgos: string[] = [];
  const a11y = pasos.find((paso) => paso.name === PASO_A11Y);
  if (!a11y) return ['sin-paso-de-accesibilidad'];
  if (!/^npm run test:e2e:a11y$/.test((a11y.run ?? '').trim())) hallazgos.push('el-paso-no-ejecuta-la-suite-a11y');
  if (/\|\|\s*true|;\s*true\s*$|set \+e/.test(a11y.run ?? '')) hallazgos.push('fallo-ignorado-en-el-comando');
  if (a11y['continue-on-error']) hallazgos.push('continue-on-error');
  if (a11y.if && a11y.if.trim() !== CONDICION_AXE_PERMITIDA) hallazgos.push('paso-condicional');
  if (a11y['working-directory'] !== 'apps/frontend') hallazgos.push('directorio-incorrecto');
  const indice = nombres.indexOf(PASO_A11Y);
  for (const previo of ['Build de produccion del frontend para E2E', 'Esperar a que el backend responda', 'Preparar base de datos (migraciones + seed)']) {
    const i = nombres.indexOf(previo);
    if (i < 0 || i > indice) hallazgos.push(`corre-antes-de:${previo}`);
  }
  if (!nombres.slice(0, indice).some((nombre) => /Playwright/.test(nombre))) hallazgos.push('sin-navegador-instalado-antes');
  const suite = nombres.indexOf(PASO_SUITE);
  if (suite < 0) hallazgos.push('se-quito-la-suite-completa');
  else if (suite < indice) hallazgos.push('la-suite-completa-corre-antes');
  return hallazgos;
}

describe('FG11-C03: el job e2e de CI impone la accesibilidad', () => {
  const ci = loadWorkflow('ci.yml');
  // FASE-CI01: la suite y el paso de axe viven en el job matriz `e2e-shard`
  // (3 shards); `e2e` pasó a ser el job final sin matriz que combina los
  // reportes y conserva el nombre estable para los checks requeridos.
  const e2e = ci.jobs['e2e-shard'];
  const pasos = (e2e.steps ?? []) as PasoCompleto[];

  it('el workflow sigue siendo YAML válido y conserva sus jobs', () => {
    expect(Object.keys(ci.jobs)).toEqual(
      expect.arrayContaining(['backend', 'frontend', 'e2e-shard', 'e2e', 'dependency-audit']),
    );
  });

  it('hay un paso propio de accesibilidad, bloqueante y en el orden correcto', () => {
    expect(a11yGateFindings(e2e)).toEqual([]);
  });

  it('las condiciones del job no cambiaron: PR hacia main, ejecución manual o llamado desde el despliegue', () => {
    expect((e2e.if ?? '').replace(/\s+/g, ' ').trim()).toBe(
      "inputs.e2e == 'run' || (!inputs.e2e && (github.event_name == 'workflow_dispatch' || (github.event_name == 'pull_request' && github.base_ref == 'main')))",
    );
  });

  it('axe corre una sola vez (shard 1), con la única condición permitida', () => {
    const a11y = pasos.find((paso) => paso.name === PASO_A11Y);
    expect(a11y?.if).toBe(CONDICION_AXE_PERMITIDA);
  });

  it('la suite completa sigue ejecutándose igual: ahora repartida en 3 shards, nada se pierde', () => {
    const suite = pasos.find((paso) => paso.name === PASO_SUITE);
    expect(suite?.run?.trim()).toBe('npm run test:e2e:sin-a11y -- --reporter=blob --shard=${{ matrix.shardIndex }}/3');
    expect(suite?.['continue-on-error']).toBeUndefined();
    expect(e2e.strategy).toMatchObject({ matrix: { shardIndex: [1, 2, 3] } });

    // La garantía original era "la suite completa corre, sin filtrar nada
    // por fuera del gate de axe". Ahora se reparte en 3 shards: hay que
    // probar que el filtro de `test:e2e:sin-a11y` excluye EXACTAMENTE los
    // dos specs que `test:e2e:a11y` ya cubrió arriba, y ningún otro — por
    // ejemplo que no se trague de pasada un spec con un nombre parecido
    // (como calendario-accesibilidad.spec.ts).
    const pkg = JSON.parse(readRepoFile('apps/frontend/package.json')) as { scripts: Record<string, string> };
    const sinA11y = pkg.scripts['test:e2e:sin-a11y'];
    expect(sinA11y).toMatch(/^playwright test --grep-invert '/);
    const patron = sinA11y.match(/--grep-invert '(.+)'$/)?.[1];
    if (!patron) throw new Error('no se pudo extraer el patrón de --grep-invert');
    const filtro = new RegExp(patron);

    const especificosDeA11y = pkg.scripts['test:e2e:a11y']
      .split(' ')
      .slice(2)
      .map((ruta) => ruta.split('/').pop() as string);
    for (const nombre of especificosDeA11y) {
      expect(filtro.test(nombre), `${nombre} debe quedar excluido de test:e2e:sin-a11y`).toBe(true);
    }

    const e2eDir = join(REPO_ROOT, 'apps/frontend/e2e');
    const otrosSpecs = readdirSync(e2eDir)
      .filter((archivo) => archivo.endsWith('.spec.ts'))
      .filter((archivo) => !especificosDeA11y.includes(archivo));
    for (const nombre of otrosSpecs) {
      expect(filtro.test(nombre), `${nombre} NO debe quedar excluido de test:e2e:sin-a11y`).toBe(false);
    }
  });

  it('el job final mantiene el nombre estable y falla si algún shard falló', () => {
    const final = ci.jobs.e2e;
    expect(final.name).toBe('E2E - suite de humo (Playwright)');
    expect(final.needs).toBe('e2e-shard');
    expect((final.if ?? '').trim()).toBe("always() && needs.e2e-shard.result != 'skipped'");
    const fallo = (final.steps ?? []).find((paso) => (paso as PasoCompleto).run?.includes('exit 1'));
    expect(fallo, 'debe haber un paso que falle explícitamente si el shard no terminó en success').toBeDefined();
    expect((fallo as PasoCompleto)?.if).toBe("needs.e2e-shard.result != 'success'");
  });

  it('el paso corre contra el build de producción y los servicios efímeros del job', () => {
    expect(e2e.env?.E2E_PRODUCTION_SERVER).toBe('1');
    expect(e2e.env?.DATABASE_URL).toMatch(/@localhost:5432\/uvg_collab_e2e/);
    const a11y = pasos.find((paso) => paso.name === PASO_A11Y);
    expect(JSON.stringify(a11y?.env ?? {})).not.toMatch(/secrets\.|TOKEN|PASSWORD/);
  });

  it('la evidencia de axe se publica pase o falle, en un artefacto propio y sin secretos', () => {
    const subida = pasos.find((paso) => paso.name === 'Subir evidencia de accesibilidad (axe)');
    expect(subida?.uses).toMatch(/^actions\/upload-artifact@/);
    expect(subida?.if).toBe("always() && steps.a11y.outcome != 'skipped'");
    expect(subida?.with).toMatchObject({ name: 'a11y-axe-report', path: 'apps/frontend/playwright-report-a11y/' });
    const a11y = pasos.find((paso) => paso.name === PASO_A11Y);
    expect(a11y?.id).toBe('a11y');
    expect(a11y?.env).toEqual({ PLAYWRIGHT_HTML_OUTPUT_DIR: 'playwright-report-a11y' });
    expect(readRepoFile('.gitignore')).toContain('playwright-report-a11y/');
  });

  it('ningún otro job ni paso de seguridad se debilitó', () => {
    for (const nombre of ['dependency-audit', 'backend', 'frontend']) {
      const job = ci.jobs[nombre];
      expect(job, nombre).toBeDefined();
      for (const paso of (job.steps ?? []) as PasoCompleto[]) expect(paso['continue-on-error'], `${nombre}: ${paso.name}`).toBeUndefined();
    }
  });
});

describe('FG11-C03: el script y los specs que ejecuta ese paso', () => {
  const pkg = JSON.parse(readRepoFile('apps/frontend/package.json')) as { scripts: Record<string, string> };

  it('`test:e2e:a11y` ejecuta specs que existen', () => {
    const script = pkg.scripts['test:e2e:a11y'];
    expect(script).toMatch(/^playwright test /);
    const specs = script.split(' ').slice(2);
    expect(specs).toContain('e2e/accesibilidad.spec.ts');
    for (const spec of specs) expect(existsSync(join(REPO_ROOT, 'apps/frontend', spec)), spec).toBe(true);
  });

  it('esos specs también entran en la suite completa: están en el directorio que recorre Playwright', () => {
    const config = readRepoFile('apps/frontend/playwright.config.ts');
    expect(config).toContain("testDir: './e2e'");
    expect(config).not.toMatch(/testIgnore|grepInvert|grep:/);
    expect(pkg.scripts['test:e2e']).toBe('playwright test');
  });

  it('el spec de accesibilidad no se salta, no se aplaza y no se limita a un solo test', () => {
    const spec = readRepoFile('apps/frontend/e2e/accesibilidad.spec.ts');
    expect(spec).not.toMatch(/test\.(skip|fixme|only)\b|describe\.(skip|fixme|only)\b|\.skip\(/);
    expect(spec).toContain('expect(describirViolaciones(bloqueantes)');
    // Cinco pantallas por dos temas.
    expect(spec.match(/\{ id: '[a-z-]+', ruta: '/g)).toHaveLength(5);
    expect(spec).toContain('for (const oscuro of [false, true])');
  });

  it('el helper de axe no admite exclusiones', () => {
    const helper = readRepoFile('apps/frontend/e2e/support/a11y.ts');
    expect(helper).not.toMatch(/\.disableRules\(|\.exclude\(|rules:/);
    expect(helper).toContain("export const IMPACTOS_BLOQUEANTES = ['serious', 'critical'] as const;");
  });
});

describe('FG11-C03: fixtures negativos del contrato', () => {
  const base = (pasoA11y: string) =>
    parseWorkflow(
      [
        'on: push',
        'jobs:',
        '  e2e:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - name: Preparar base de datos (migraciones + seed)',
        '        run: npx prisma migrate deploy',
        '      - name: Esperar a que el backend responda',
        '        run: curl -sf http://localhost:3001/api',
        '      - name: Build de produccion del frontend para E2E',
        '        run: npm run build',
        '      - name: Instalar navegador y dependencias de Playwright',
        '        run: npx playwright install --with-deps chromium',
        pasoA11y,
        `      - name: ${PASO_SUITE}`,
        '        run: npm run test:e2e',
      ].join('\n'),
    ).jobs.e2e;
  const paso = (extra: string[], run = 'npm run test:e2e:a11y') =>
    [`      - name: ${PASO_A11Y}`, '        working-directory: apps/frontend', ...extra, `        run: ${run}`].join('\n');

  it('el paso correcto no produce hallazgos', () => {
    expect(a11yGateFindings(base(paso([])))).toEqual([]);
  });

  it.each([
    ['continue-on-error', paso(['        continue-on-error: true']), 'continue-on-error'],
    ['un fallo ignorado con `|| true`', paso([], 'npm run test:e2e:a11y || true'), 'fallo-ignorado-en-el-comando'],
    ['un paso condicional', paso(["        if: github.base_ref == 'main'"]), 'paso-condicional'],
    ['otro comando', paso([], 'npm run lint'), 'el-paso-no-ejecuta-la-suite-a11y'],
  ])('detecta %s', (_nombre, yamlDelPaso, hallazgo) => {
    expect(a11yGateFindings(base(yamlDelPaso))).toContain(hallazgo);
  });

  it('detecta que el paso no existe', () => {
    const sinPaso = parseWorkflow(['on: push', 'jobs:', '  e2e:', '    steps:', `      - name: ${PASO_SUITE}`, '        run: npm run test:e2e'].join('\n'));
    expect(a11yGateFindings(sinPaso.jobs.e2e)).toEqual(['sin-paso-de-accesibilidad']);
  });
});

describe('FG11-C04: la puerta falla cerrada y la autoprueba no entra en CI', () => {
  const contrato = readRepoFile('apps/frontend/e2e/a11y-gate-contract.spec.ts');
  const doc = readRepoFile('docs/qa/sprint9/accesibilidad-ci.md');

  it('el script de accesibilidad incluye el contrato de la puerta', () => {
    const pkg = JSON.parse(readRepoFile('apps/frontend/package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts['test:e2e:a11y']).toBe('playwright test e2e/accesibilidad.spec.ts e2e/a11y-gate-contract.spec.ts');
  });

  it('el contrato prueba una página limpia, una defectuosa y su corrección, sin saltarse nada', () => {
    expect(contrato).toContain("const REGLAS_ESPERADAS = ['button-name', 'color-contrast', 'image-alt', 'label'];");
    expect(contrato).toContain('una página accesible pasa sin violaciones bloqueantes');
    expect(contrato).toContain('al corregir los defectos en la misma página, vuelve a pasar');
    expect(contrato).not.toMatch(/test\.(skip|fixme|only)\b|describe\.(skip|fixme|only)\b/);
  });

  it('la página defectuosa vive solo en el spec: la aplicación no contiene ningún fixture roto', () => {
    expect(contrato).toContain('await page.setContent(html');
    expect(contrato).not.toMatch(/page\.goto\(/);
  });

  it('la autoprueba que DEBE fallar solo existe con una variable explícita, que CI no define', () => {
    expect(contrato).toContain("if (process.env.A11Y_GATE_SELFTEST === 'fail') {");
    for (const workflow of ['ci.yml', 'deploy.yml']) {
      expect(readRepoFile(`.github/workflows/${workflow}`), workflow).not.toContain('A11Y_GATE_SELFTEST');
    }
    expect(readRepoFile('apps/frontend/playwright.config.ts')).not.toContain('A11Y_GATE_SELFTEST');
  });

  it('la documentación registra los dos códigos de salida y lo que sigue sin verificar', () => {
    expect(doc).toContain('| `npm run test:e2e:a11y` | 15 pasan | **0** |');
    expect(doc).toContain('| `A11Y_GATE_SELFTEST=fail npm run test:e2e:a11y` | 15 pasan y 1 falla, listando las cuatro violaciones | **1** |');
    expect(doc).toContain('**`CI_REMOTE_VERIFICATION_PENDING`.**');
    expect(doc).toContain('Ninguna ejecución de GitHub Actions ha corrido este paso todavía');
    expect(doc).not.toMatch(/CI (pasó|pas[oó] en verde)|verificado en GitHub Actions/i);
  });

  it('la documentación describe las condiciones reales del job, sin prometer que corre en develop', () => {
    expect(doc).toContain('| Push o pull request hacia `develop` | **No** |');
    expect(doc).toContain('Las condiciones del job **no se cambiaron**');
  });
});
