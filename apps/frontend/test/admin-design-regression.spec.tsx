import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RAIZ, VISTAS_ADMIN, leer } from './helpers/admin-design';

/**
 * FG07-C04 (T-320). Cierre de la matriz de diseño administrativo: lo que queda
 * fuera de la escala está enumerado archivo por archivo. Un literal nuevo —o
 * uno que desaparezca sin actualizar la lista— hace fallar esta prueba.
 */

const tsx = (dir: string): string[] =>
  readdirSync(join(RAIZ, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? tsx(join(dir, e.name)) : e.name.endsWith('.tsx') ? [join(dir, e.name)] : [],
  );
const AJENO = 'components/admin/AdminMetricsSection.tsx';
const ARBOL = [...tsx('app/dashboard/admin'), ...tsx('app/dashboard/projects/admin'), ...tsx('components/admin')]
  .filter((archivo) => archivo !== AJENO)
  .sort();

/** Tamaños y radios literales que siguen en el árbol administrativo, y por qué (ver el inventario, sección 8). */
const EXCEPCIONES: Record<string, string[]> = {
  'app/dashboard/admin/proyectos/[id]/admin-project-detail-client.tsx': ['rounded-lg', 'rounded-md'],
  'app/dashboard/admin/proyectos/[id]/cierre/closure-review-client.tsx': ['rounded-lg', 'rounded-lg', 'rounded-lg', 'rounded-lg', 'rounded-md', 'text-[13px]'],
  'app/dashboard/admin/proyectos/admin-projects-client.tsx': ['rounded-lg'],
  'app/dashboard/admin/solicitudes-recuperacion/page.tsx': ['rounded-lg', 'rounded-lg', 'rounded-md'],
  'app/dashboard/admin/usuarios/page.tsx': ['rounded-md', 'rounded-md'],
  'components/admin/AdminLayout.tsx': ['rounded-lg', 'rounded-md'],
  'components/admin/ConfirmActionDialog.tsx': ['rounded-md', 'rounded-md', 'rounded-md', 'rounded-md'],
  'components/admin/ProjectFeedbackSheet.tsx': ['rounded-lg', 'rounded-lg', 'rounded-lg', 'rounded-md'],
  'components/admin/ProjectReviewSheet.tsx': ['rounded-lg', 'rounded-lg', 'rounded-lg'],
  'components/admin/RevisionHistoryPanel.tsx': ['rounded-lg'],
  'components/admin/UserDetailSheet.tsx': ['rounded-md'],
  'components/admin/security/security-events-filters.tsx': ['rounded-md'],
  'components/admin/security/security-events-table.tsx': ['rounded-md'],
  'components/admin/sprints/admin-calendar-view.tsx': ['text-[15px]'],
};

const literales = (fuente: string) =>
  [...(fuente.match(/\btext-\[[0-9.]+px\]/g) ?? []), ...(fuente.match(/(?<![\w-])rounded-(?:md|lg|xl|2xl|3xl)\b/g) ?? [])].sort();

describe('FG07-C04: regresión del diseño administrativo', () => {
  it.each(ARBOL)('%s: sus literales de tamaño y radio son exactamente los registrados', (archivo) => {
    expect(literales(leer(archivo))).toEqual(EXCEPCIONES[archivo] ?? []);
  });

  it('toda excepción registrada apunta a un archivo que existe', () => {
    for (const archivo of Object.keys(EXCEPCIONES)) expect(ARBOL).toContain(archivo);
  });

  it('las excepciones son solo valores sin token equivalente', () => {
    const valores = new Set(Object.values(EXCEPCIONES).flat());
    // rounded-lg (0.5rem) y rounded-md (0.375rem) no tienen token; 13 px y 15 px quedan en dos textos densos.
    expect([...valores].sort()).toEqual(['rounded-lg', 'rounded-md', 'text-[13px]', 'text-[15px]']);
  });

  it('30 de los 44 archivos del árbol quedan sin ningún literal', () => {
    // 40 al cerrar T-320; entró la página propia de «Tendencias de uso» y salió el catálogo temporal de
    // etiquetas, ninguna de las dos con literales; después entraron la pantalla de anuncios (HU-191) y el
    // catálogo temporal de botones, tampoco con literales. Luego entró la lista de reuniones del
    // calendario administrativo (`meeting-list-view.tsx`), sin literales. El selector de vistas del
    // calendario de Sprints pasó al control segmentado del estudiante (`rounded-pill`) y perdió su `rounded-md`.
    // HU-195 (T-363): entra el campo de proyectos invitados de la reunión de Administración, sin literales.
    expect(ARBOL).toHaveLength(44);
    expect(ARBOL.filter((archivo) => literales(leer(archivo)).length === 0)).toHaveLength(30);
  });
});

describe('FG07-C04: el inventario registra el antes y el después', () => {
  const inventario = readFileSync(join(RAIZ, '../../docs/qa/sprint9/admin-design-inventory.md'), 'utf8');

  it('conserva la línea base y añade el estado final por vista', () => {
    expect(inventario).toContain('## 2. Línea base');
    expect(inventario).toContain('## 7. Estado tras T-320');
    for (const ruta of Object.keys(VISTAS_ADMIN)) {
      expect(inventario.split('## 7. Estado tras T-320')[1], ruta).toContain(`| \`${ruta}\` |`);
    }
  });

  it('declara los totales medidos del árbol completo, antes y después', () => {
    expect(inventario).toContain('| Tamaños literales | 47 | 2 |');
    expect(inventario).toContain('| Radios literales | 68 | 30 |');
  });

  it('enumera cada excepción que esta prueba fija', () => {
    for (const archivo of Object.keys(EXCEPCIONES)) expect(inventario, archivo).toContain(archivo);
    expect(inventario).toContain(AJENO);
    expect(inventario).toContain('bg-amber-600');
  });

  it('no declara resuelto lo que no se tocó: los botones propios siguen contados como pendientes', () => {
    expect(inventario).toMatch(/D5 .* Pendiente/);
  });
});
