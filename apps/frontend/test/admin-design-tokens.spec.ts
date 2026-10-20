import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RAIZ, VISTAS_ADMIN, leer, medir, type Medida } from './helpers/admin-design';

/**
 * FG07 (T-320). Contratos visuales de las vistas administrativas, medidos sobre
 * su código fuente. No sustituye a mirar la pantalla: fija lo que se puede
 * contar —literales de tamaño, radio y color fuera de los tokens de HU-163— para
 * que el inventario de `docs/qa/sprint9/admin-design-inventory.md` no dependa
 * de una revisión manual y para que un literal nuevo haga fallar la prueba.
 */

/**
 * Línea base al iniciar FG07 (HEAD 7091a310). Cada cifra es un incumplimiento
 * contado; el inventario explica cuáles se corrigen y cuáles son excepción.
 */
const LINEA_BASE: Record<string, Medida> = {
  '/dashboard/admin': { px: 0, radio: 0, hex: 0, boton: 0, titular: true },
  '/dashboard/admin/usuarios': { px: 1, radio: 4, hex: 0, boton: 2, titular: true },
  '/dashboard/admin/solicitudes-recuperacion': { px: 1, radio: 3, hex: 0, boton: 2, titular: true },
  // HU-179 (PR #270): la vista llegó después de FG07; su línea base es la del PR #270.
  '/dashboard/admin/cuentas-pendientes': { px: 1, radio: 5, hex: 0, boton: 3, titular: false },
  // Página propia de «Tendencias de uso»: nació ya con los tokens; su línea base es su primera medición.
  '/dashboard/admin/metricas': { px: 0, radio: 0, hex: 0, boton: 0, titular: true },
  '/dashboard/admin/seguridad': { px: 0, radio: 0, hex: 0, boton: 0, titular: true },
  // HU-191 (T-352): nació ya con los tokens; su línea base es su primera medición.
  '/dashboard/admin/anuncios': { px: 0, radio: 0, hex: 0, boton: 0, titular: true },
  // Catálogo temporal de botones: su único `<button>` propio pinta las muestras en línea.
  '/dashboard/admin/botones': { px: 0, radio: 0, hex: 0, boton: 1, titular: true },
  '/dashboard/admin/apelaciones': { px: 1, radio: 0, hex: 0, boton: 0, titular: true },
  '/dashboard/admin/apelaciones/[apelacionId]': { px: 1, radio: 0, hex: 0, boton: 0, titular: true },
  '/dashboard/admin/proyectos': { px: 0, radio: 2, hex: 0, boton: 0, titular: true },
  '/dashboard/admin/proyectos/[id]': { px: 12, radio: 7, hex: 0, boton: 0, titular: false },
  '/dashboard/admin/proyectos/[id]/cierre': { px: 4, radio: 5, hex: 0, boton: 0, titular: true },
  '/dashboard/admin/sprints': { px: 0, radio: 1, hex: 0, boton: 0, titular: true },
  '/dashboard/projects/admin/reviews': { px: 0, radio: 1, hex: 0, boton: 0, titular: true },
};

/** Estado tras FG07-C03: lo que queda son las excepciones que el inventario explica. */
const ESTADO_ACTUAL: Record<string, Medida> = {
  '/dashboard/admin': { px: 0, radio: 0, hex: 0, boton: 0, titular: true },
  '/dashboard/admin/usuarios': { px: 0, radio: 0, hex: 0, boton: 2, titular: true },
  '/dashboard/admin/solicitudes-recuperacion': { px: 0, radio: 2, hex: 0, boton: 2, titular: true },
  // Al pasar a la tabla compartida perdió su radio literal y sus tres `<button>` propios.
  '/dashboard/admin/cuentas-pendientes': { px: 0, radio: 0, hex: 0, boton: 0, titular: true },
  '/dashboard/admin/metricas': { px: 0, radio: 0, hex: 0, boton: 0, titular: true },
  '/dashboard/admin/seguridad': { px: 0, radio: 0, hex: 0, boton: 0, titular: true },
  '/dashboard/admin/anuncios': { px: 0, radio: 0, hex: 0, boton: 0, titular: true },
  '/dashboard/admin/botones': { px: 0, radio: 0, hex: 0, boton: 1, titular: true },
  '/dashboard/admin/apelaciones': { px: 0, radio: 0, hex: 0, boton: 0, titular: true },
  '/dashboard/admin/apelaciones/[apelacionId]': { px: 0, radio: 0, hex: 0, boton: 0, titular: true },
  '/dashboard/admin/proyectos': { px: 0, radio: 1, hex: 0, boton: 0, titular: true },
  '/dashboard/admin/proyectos/[id]': { px: 0, radio: 2, hex: 0, boton: 0, titular: true },
  '/dashboard/admin/proyectos/[id]/cierre': { px: 1, radio: 5, hex: 0, boton: 0, titular: true },
  '/dashboard/admin/sprints': { px: 0, radio: 1, hex: 0, boton: 0, titular: true },
  '/dashboard/projects/admin/reviews': { px: 0, radio: 0, hex: 0, boton: 0, titular: true },
};

describe('FG07-C01: tokens de diseño que usan las vistas administrativas', () => {
  const css = leer('app/global.css');

  it.each(['type-display', 'type-section', 'type-subtitle', 'type-body', 'type-meta'])('la escala tipográfica define .%s', (clase) => {
    expect(css).toContain(`.${clase} {`);
  });

  it.each([
    ['--radius-card', '1rem'],
    ['--radius-control', '0.75rem'],
    ['--radius-tag', '0.4375rem'],
  ])('el radio %s vale %s', (token, valor) => {
    expect(css).toContain(`${token}: ${valor};`);
  });

  it('`rounded-xl` y `rounded-2xl` valen lo mismo que `rounded-control` y `rounded-card`: sustituirlos no mueve un píxel', () => {
    // Tailwind: rounded-xl = 0.75rem, rounded-2xl = 1rem.
    expect(css).toContain('--radius-control: 0.75rem;');
    expect(css).toContain('--radius-card: 1rem;');
  });

  it.each([
    ['micro', '0.25rem'],
    ['tight', '0.5rem'],
    ['inline', '0.75rem'],
    ['stack', '1rem'],
    ['card', '1.5rem'],
    ['section', '2rem'],
    ['page', '3rem'],
  ])('la escala de espaciado define %s = %s', (nombre, valor) => {
    expect(css).toContain(`--spacing-${nombre}: ${valor};`);
  });

  it('la tarjeta y la etiqueta estándar salen de esos tokens', () => {
    expect(css).toMatch(/\.card-base \{[^}]*border-radius: var\(--radius-card\);[^}]*padding: var\(--spacing-card\);/);
    expect(css).toMatch(/\.pill \{[^}]*border-radius: var\(--radius-tag\);/);
  });
});

describe('FG07-C01: inventario de las vistas administrativas', () => {
  const inventario = readFileSync(join(RAIZ, '../../docs/qa/sprint9/admin-design-inventory.md'), 'utf8');

  it('cubre todas las rutas administrativas que existen, ni una menos', () => {
    const paginas = (dir: string, base: string): string[] =>
      readdirSync(join(RAIZ, dir), { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? paginas(join(dir, e.name), `${base}/${e.name}`) : e.name === 'page.tsx' ? [base] : [],
      );
    const reales = [...paginas('app/dashboard/admin', '/dashboard/admin'), ...paginas('app/dashboard/projects/admin', '/dashboard/projects/admin')];
    expect(Object.keys(VISTAS_ADMIN).sort()).toEqual(reales.sort());
  });

  it.each(Object.entries(VISTAS_ADMIN))('%s está en el inventario con su archivo', (ruta, archivo) => {
    expect(inventario).toContain(`\`${ruta}\``);
    expect(inventario).toContain(archivo);
  });

  it.each(Object.entries(VISTAS_ADMIN))('%s: usa el ancho de página administrativo y lleva titular', (ruta, archivo) => {
    const fuente = leer(archivo);
    // La revisión de una apelación es una vista de lectura: usa a propósito un ancho menor (1100 px).
    const ancho = ruta === '/dashboard/admin/apelaciones/[apelacionId]' ? /max-w-\[1100px\]|ADMIN_PAGE_NARROW/ : /max-w-\[1400px\]|ADMIN_PAGE/;
    expect(fuente).toMatch(ancho);
    expect(fuente.match(/<h1\b/g)?.length ?? 0).toBeGreaterThanOrEqual(1);
  });

  it.each(Object.entries(VISTAS_ADMIN))('%s: la medición actual es la registrada y ninguna cifra empeora respecto a la línea base', (ruta, archivo) => {
    const actual = medir(leer(archivo));
    expect(actual).toEqual(ESTADO_ACTUAL[ruta]);
    const base = LINEA_BASE[ruta];
    for (const clave of ['px', 'radio', 'hex', 'boton'] as const) expect(actual[clave], clave).toBeLessThanOrEqual(base[clave]);
    expect(actual.titular).toBe(true);
  });

  it('la línea base registrada en el inventario es la que se midió', () => {
    for (const [ruta, m] of Object.entries(LINEA_BASE)) {
      expect(inventario, ruta).toContain(`| \`${ruta}\` | ${m.titular ? 'sí' : 'no'} | ${m.px} | ${m.radio} | ${m.boton} | ${m.hex} |`);
    }
  });
});
