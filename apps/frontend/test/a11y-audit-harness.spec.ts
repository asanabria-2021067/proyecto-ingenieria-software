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
    env: { PATH: process.env.PATH ?? '', ...env } as NodeJS.ProcessEnv,
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
