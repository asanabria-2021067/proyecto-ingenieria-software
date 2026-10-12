import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * FG09-C01 (T-316). Contrato del harness de auditoría de accesibilidad. No
 * lanza un navegador: comprueba qué mide y que se niega a correr donde no debe.
 */

const REPO = join(__dirname, '../../..');
const SCRIPT = join(REPO, 'scripts/qa/sprint9-a11y-audit.mjs');
const fuente = readFileSync(SCRIPT, 'utf8');
const inventario = readFileSync(join(REPO, 'docs/qa/sprint9/a11y-screen-inventory.md'), 'utf8');

const ejecutar = (args: string[], env: Record<string, string> = {}) =>
  spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8',
    // Entorno mínimo: el script no debe heredar variables de quien corre la suite.
    env: { PATH: process.env.PATH ?? '', NODE_ENV: 'test', ...env },
  });

describe('FG09-C01: harness de auditoría de accesibilidad', () => {
  const rutas = [...fuente.matchAll(/\{ id: '([^']+)', ruta: '([^']+)', rol: '(estudiante|admin)'/g)].map((m) => ({ id: m[1], ruta: m[2], rol: m[3] }));

  it('mide cinco pantallas, en claro y oscuro, con las dos herramientas: 20 mediciones', () => {
    expect(rutas).toHaveLength(5);
    expect(fuente).toContain("const TEMAS = ['claro', 'oscuro'];");
    expect(fuente).toContain('window.axe.run(');
    expect(fuente).toContain("onlyCategories: ['accessibility']");
    expect(rutas.length * 2 * 2).toBe(20);
  });

  it('las cinco pantallas son las del inventario, cada una con su ruta', () => {
    expect(rutas.map((r) => r.ruta).sort()).toEqual(
      ['/dashboard', '/dashboard/admin', '/dashboard/admin/proyectos?grupo=activos', '/dashboard/calendario', '/dashboard/perfil/editar'].sort(),
    );
    for (const { ruta } of rutas) expect(inventario).toContain(`\`${ruta}\``);
  });

  it('cada ruta medida existe como página de la aplicación', () => {
    for (const { ruta } of rutas) {
      const pagina = join(__dirname, '../app', ruta.split('?')[0], 'page.tsx');
      expect(() => readFileSync(pagina), ruta).not.toThrow();
    }
  });

  it('usa las reglas WCAG 2.x A y AA y verifica que el tema y la sesión son los esperados', () => {
    expect(fuente).toContain("const TAGS_WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];");
    expect(fuente).toContain('el tema aplicado no es');
    expect(fuente).toContain('la sesión terminó en');
    expect(fuente).toContain('disableStorageReset: true');
  });

  it('axe-core y Lighthouse no son dependencias del repositorio todavía: salen de un directorio externo', () => {
    expect(fuente).toContain('const TOOLS = process.env.A11Y_TOOLS_DIR;');
    expect(fuente).not.toMatch(/from 'axe-core'|from 'lighthouse'/);
    const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));
    expect(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })).not.toContain('lighthouse');
  });

  it('no guarda cookies ni cabeceras de sesión en los informes', () => {
    expect(fuente).not.toMatch(/cookies\(\)|storageState|document\.cookie|authorization/i);
  });

  it('sin --out se niega a correr', () => {
    const r = ejecutar([], { A11Y_TOOLS_DIR: '/no/existe' });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('falta --out');
  });

  it('sin A11Y_TOOLS_DIR se niega a correr', () => {
    const r = ejecutar(['--out', '/tmp/a11y-fuera']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('define A11Y_TOOLS_DIR');
  });

  it('se niega a escribir informes dentro del repositorio', () => {
    const r = ejecutar(['--out', join(REPO, 'docs/qa/sprint9/salida')], { A11Y_TOOLS_DIR: '/no/existe' });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('--out debe estar fuera del repositorio');
  });

  it('se niega a medir una URL que no sea local', () => {
    const r = ejecutar(['--out', '/tmp/a11y-fuera', '--base', 'https://uvgenius.example.com'], { A11Y_TOOLS_DIR: '/no/existe' });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('no es local');
  });

  it('el inventario declara los límites de la medición', () => {
    expect(inventario).toContain('solo se mide el primero');
    expect(inventario).toContain('una puntuación de 100 no equivale a cumplir AA');
    expect(inventario).toContain('no se pudo medir con datos');
  });
});

describe('FG09-C02: matriz de hallazgos de la línea base', () => {
  const auditoria = readFileSync(join(REPO, 'docs/qa/sprint9/accesibilidad-auditoria.md'), 'utf8');

  it('resume las 10 combinaciones de pantalla y tema', () => {
    const filas = auditoria.split('## 2. Hallazgos')[0].match(/^\| [^|]+ \| (claro|oscuro) \| \d+ \|/gm) ?? [];
    expect(filas).toHaveLength(10);
    expect(filas.filter((fila) => fila.includes('| claro |'))).toHaveLength(5);
  });

  it('cada hallazgo tiene identificador, ruta, regla, criterio WCAG y evidencia o selector', () => {
    const hallazgos = auditoria.split(/^### /m).slice(1).filter((bloque) => bloque.startsWith('A11Y-'));
    expect(hallazgos.map((h) => h.slice(0, 7))).toEqual(['A11Y-01', 'A11Y-02', 'A11Y-03', 'A11Y-04', 'A11Y-05', 'A11Y-06', 'A11Y-07', 'A11Y-08']);
    for (const hallazgo of hallazgos) {
      const id = hallazgo.slice(0, 7);
      expect(hallazgo, id).toMatch(/\| Rutas? /);
      expect(hallazgo, id).toMatch(/\| Regla \| (axe|Lighthouse) `[a-z-]+`/);
      expect(hallazgo, id).toMatch(/WCAG \d\.\d\.\d/);
      expect(hallazgo, id).toMatch(/\| (Elementos?|Selectores|Elementos compartidos) \|/);
      expect(hallazgo, id).toMatch(/— P[12]$/m);
    }
  });

  it('los hallazgos de contraste registran la razón medida y los colores realmente pintados', () => {
    for (const medida of ['**3.62:1** — `#bad6c8` sobre `#1a7649`', '**3.54:1** — `#1f6539` sobre `#67cc87`', '**2.35:1** — `#a7a9aa` sobre `#ffffff`', '**3.22:1** — `#5f6267` sobre `#080b0e`']) {
      expect(auditoria).toContain(medida);
    }
  });

  it('no declara cumplimiento AA: es una línea base con fallos y límites', () => {
    expect(auditoria).toContain('No declara cumplimiento de WCAG AA');
    expect(auditoria).toContain('eso no prueba que cumplan AA');
    expect(auditoria).toContain('## 5. Fuera del alcance de esta medición');
    expect(auditoria).not.toMatch(/cumple (con )?WCAG|conforme a AA/i);
  });

  it('prioriza los críticos y graves para la corrección', () => {
    const prioridad = auditoria.split('## 4. Prioridad para la corrección')[1];
    expect(prioridad.indexOf('A11Y-04')).toBeLessThan(prioridad.indexOf('A11Y-01'));
    expect(prioridad.indexOf('A11Y-01')).toBeLessThan(prioridad.indexOf('A11Y-06'));
  });
});
