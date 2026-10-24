import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RAIZ, VISTAS_ADMIN, leer, medir } from './helpers/admin-design';

/**
 * FG07-C03 (T-320). Las superficies administrativas usan los tokens de HU-163.
 * Se mide el árbol administrativo completo —vistas y sus componentes—, no solo
 * el archivo principal de cada ruta.
 */

const tsx = (dir: string): string[] =>
  readdirSync(join(RAIZ, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? tsx(join(dir, e.name)) : e.name.endsWith('.tsx') ? [join(dir, e.name)] : [],
  );

/**
 * `AdminMetricsSection` es de HU-178 (otro responsable). T-320 lo dejó fuera de su conteo y sin tocar;
 * los gates de métricas y gráficas del cierre de Sprint 9 lo alinearon con los tokens. Sigue fuera del
 * conteo histórico de abajo, pero ya se le exige lo mismo que al resto.
 */
const AJENO = 'components/admin/AdminMetricsSection.tsx';
const ARBOL = [...tsx('app/dashboard/admin'), ...tsx('app/dashboard/projects/admin'), ...tsx('components/admin')].filter(
  (archivo) => archivo !== AJENO,
);

describe('FG07-C03: superficies administrativas sobre tokens', () => {
  it('el árbol administrativo tiene las vistas y componentes esperados', () => {
    expect(ARBOL.length).toBeGreaterThanOrEqual(38);
    for (const archivo of Object.values(VISTAS_ADMIN)) expect(ARBOL).toContain(archivo);
  });

  it.each(ARBOL)('%s no usa radios literales con token equivalente', (archivo) => {
    // rounded-xl = rounded-control y rounded-2xl = rounded-card: el literal ya no tiene motivo.
    expect(leer(archivo)).not.toMatch(/(?<![\w-])rounded-(xl|2xl|3xl)\b/);
  });

  it.each(ARBOL)('%s no usa los tamaños literales que sustituye `type-micro`', (archivo) => {
    expect(leer(archivo)).not.toMatch(/text-\[1[01]px\]/);
  });

  it('en todo el árbol quedan 2 tamaños y 30 radios literales, todos sin token de igual valor', () => {
    const total = ARBOL.map((archivo) => medir(leer(archivo))).reduce(
      (suma, m) => ({ px: suma.px + m.px, radio: suma.radio + m.radio, hex: suma.hex + m.hex }),
      { px: 0, radio: 0, hex: 0 },
    );
    // Línea base del mismo árbol en 7091a310: 46 tamaños y 63 radios; con la vista de cuentas
    // pendientes (HU-179, PR #270) tal como llegó, 47 y 68.
    expect(total).toEqual({ px: 2, radio: 30, hex: 0 });
    // Los radios que quedan son rounded-lg y rounded-md: no existe un token con su valor.
    const restantes = ARBOL.flatMap((archivo) => leer(archivo).match(/(?<![\w-])rounded-(?:md|lg|xl|2xl|3xl)\b/g) ?? []);
    expect(new Set(restantes)).toEqual(new Set(['rounded-lg', 'rounded-md']));
  });

  it('el componente de métricas ya cumple las mismas reglas que el árbol: sin radios ni tamaños con token equivalente', () => {
    expect(leer(AJENO)).not.toMatch(/(?<![\w-])rounded-(xl|2xl|3xl)\b/);
    expect(leer(AJENO)).not.toMatch(/text-\[1[01]px\]/);
    expect(leer(AJENO)).toContain('card-base');
  });

  it('todas las vistas tienen su titular en la escala tipográfica', () => {
    for (const [ruta, archivo] of Object.entries(VISTAS_ADMIN)) {
      expect(medir(leer(archivo)).titular, ruta).toBe(true);
    }
    const detalle = leer(VISTAS_ADMIN['/dashboard/admin/proyectos/[id]']);
    expect(detalle).toContain('<h1 className="type-display break-words">');
    expect(detalle).not.toMatch(/font-headline text-2xl font-black/);
  });

  it('las migas de pan de las vistas de detalle usan el mismo tamaño que la miga compartida', () => {
    expect(leer('components/admin/admin-breadcrumb.tsx')).toContain('<BreadcrumbList className="text-sm">');
    for (const ruta of ['/dashboard/admin/proyectos/[id]', '/dashboard/admin/proyectos/[id]/cierre']) {
      expect(leer(VISTAS_ADMIN[ruta]), ruta).toContain('<BreadcrumbList className="text-sm">');
    }
  });

  it('ninguna vista escribe colores hexadecimales', () => {
    for (const archivo of ARBOL) {
      expect(leer(archivo), archivo).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    }
  });

  it('la paleta cruda de Tailwind solo aparece en el botón ámbar de «Revisar», pendiente de decisión de diseño', () => {
    const cruda = /\b(?:bg|text|border)-(?:red|green|blue|amber|yellow|gray|zinc)-\d{2,3}\b/g;
    const usos = ARBOL.flatMap((archivo) => (leer(archivo).match(cruda) ?? []).map((clase) => `${archivo}: ${clase}`));
    // Excepción registrada en el inventario: no hay un token de «acción de advertencia» y el tono
    // de ese botón es una decisión de diseño abierta. No se cambia en T-320.
    expect(usos.sort()).toEqual([
      'components/admin/ConfirmActionDialog.tsx: bg-amber-600',
      'components/admin/ConfirmActionDialog.tsx: bg-amber-700',
      'components/admin/request-inbox.tsx: bg-amber-600',
      'components/admin/request-inbox.tsx: bg-amber-700',
    ]);
  });

  it('«Eventos de seguridad» no duplica el «Actualizar» de la barra superior', () => {
    const seguridad = leer(VISTAS_ADMIN['/dashboard/admin/seguridad']);
    expect(seguridad).not.toMatch(/Actualizando|RefreshCw/);
    expect(leer('components/admin/AdminLayout.tsx')).toContain('aria-label="Actualizar"');
  });
});
