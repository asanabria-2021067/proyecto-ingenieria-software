import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = join(__dirname, '..');
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');

/** Código de la pantalla del calendario: sus componentes y la página. */
const ARCHIVOS = [
  ...readdirSync(join(RAIZ, 'components', 'calendar'))
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => join('components', 'calendar', f)),
  join('app', 'dashboard', 'calendario', 'page.tsx'),
];

describe('calendario — tokens de tipografía y radios (G04-C10, UI-33)', () => {
  it('type-micro existe en global.css (11 px, sin color ni peso) y está documentado en el sistema de diseño', () => {
    const css = leer(join('app', 'global.css'));
    expect(css).toMatch(/--text-micro:\s*0\.6875rem;/);
    expect(css).toMatch(/--text-micro--line-height:\s*1\.5;/);
    const regla = css.slice(css.indexOf('@utility type-micro {'), css.indexOf('}', css.indexOf('@utility type-micro {')));
    expect(regla).toContain('font-size: var(--text-micro)');
    expect(regla).not.toMatch(/\bcolor:|font-weight:/);
    const docs = readFileSync(join(RAIZ, '..', '..', 'docs', 'design-system.md'), 'utf8');
    expect(docs).toContain('`type-micro`');
    expect(docs).toMatch(/11 \/ 16\.5/);
  });

  // tailwind-merge (cn) trata un `text-*` que no conoce como color y lo descarta junto a otro
  // color de texto: las iniciales de un avatar perdían su tamaño. Por eso es una clase `type-*`.
  it.each(ARCHIVOS)('%s no usa la utilidad text-micro (se perdería al pasar por cn)', (ruta) => {
    expect(leer(ruta)).not.toMatch(/\btext-micro\b/);
  });

  it.each(ARCHIVOS)('%s no usa tamaños de letra literales en px ni radios fuera de la escala', (ruta) => {
    const codigo = leer(ruta);
    expect(codigo.match(/text-\[\d+px\]/g) ?? []).toEqual([]);
    expect(codigo.match(/\brounded-(xl|2xl|3xl|\[[^\]]+\])/g) ?? []).toEqual([]);
  });

  it('el titular de la página usa type-display y las filas de agenda el radio de control', () => {
    expect(leer(join('app', 'dashboard', 'calendario', 'page.tsx'))).toMatch(/<h1 className="type-display mb-1">/);
    const fila = leer(join('components', 'calendar', 'agenda-item-row.tsx'));
    expect(fila.match(/rounded-control border-l-4/g)).toHaveLength(2);
  });

  it('los botones de un mismo grupo comparten radio: pie del formulario y barra del calendario en pastilla', () => {
    const dialogo = leer(join('components', 'calendar', 'event-form-dialog.tsx'));
    const pie = dialogo.slice(dialogo.indexOf('<DialogFooter'));
    const radiosDeBotones = [...pie.matchAll(/<Button[\s\S]*?className="([^"]*)"/g)].map((m) => m[1].match(/rounded-[a-z]+/)?.[0]);
    expect(radiosDeBotones).toEqual(['rounded-pill', 'rounded-pill', 'rounded-pill']);

    const pagina = leer(join('app', 'dashboard', 'calendario', 'page.tsx'));
    const barra = pagina.slice(pagina.indexOf('<CalendarFilterMenu'), pagina.indexOf("{vista === 'mes' && ("));
    expect(new Set(barra.match(/rounded-[a-z]+/g))).toEqual(new Set(['rounded-pill']));
    expect(leer(join('components', 'calendar', 'calendar-filter-menu.tsx'))).toMatch(/<Button type="button" variant="outline" className="h-9 gap-1\.5 rounded-pill /);
  });
});

describe('calendario — una sola definición de prioridades e ícono de tipo (G04-C12, UI-37)', () => {
  const FUENTES = [
    ...ARCHIVOS,
    ...readdirSync(join(RAIZ, 'lib', 'calendar'))
      .filter((f) => f.endsWith('.ts'))
      .map((f) => join('lib', 'calendar', f)),
  ];
  const definiciones = (patron: RegExp) => FUENTES.filter((ruta) => patron.test(leer(ruta)));

  it('PRIORIDAD_DOT, PRIORIDAD_BORDE e IconoTipoEvento se definen solo en lib/calendar/paleta.ts', () => {
    const paleta = join('lib', 'calendar', 'paleta.ts');
    expect(definiciones(/\bconst PRIORIDAD_DOT\b/)).toEqual([paleta]);
    expect(definiciones(/\bconst PRIORIDAD_BORDE\b/)).toEqual([paleta]);
    expect(definiciones(/\bfunction IconoTipoEvento\b/)).toEqual([paleta]);
    // Los ayudantes locales duplicados desaparecieron.
    expect(definiciones(/\bfunction (IconoEvento|EventoIcono)\b/)).toEqual([]);
  });

  it('las vistas que los usan los importan de paleta (Mes, Semana, Día/Semana por horas y la fila de agenda)', () => {
    const importa = (ruta: string, nombre: string) => new RegExp(`import \\{[^}]*\\b${nombre}\\b[^}]*\\} from '@/lib/calendar/paleta'`).test(leer(ruta));
    expect(importa(join('components', 'calendar', 'month-view.tsx'), 'IconoTipoEvento')).toBe(true);
    expect(importa(join('components', 'calendar', 'week-view.tsx'), 'IconoTipoEvento')).toBe(true);
    expect(importa(join('components', 'calendar', 'week-view.tsx'), 'PRIORIDAD_DOT')).toBe(true);
    expect(importa(join('components', 'calendar', 'time-grid-view.tsx'), 'PRIORIDAD_DOT')).toBe(true);
    expect(importa(join('components', 'calendar', 'agenda-item-row.tsx'), 'PRIORIDAD_BORDE')).toBe(true);
  });

  it('paleta.ts no importa time-grid (sin dependencia circular: time-grid ya importa paleta)', () => {
    expect(leer(join('lib', 'calendar', 'paleta.ts'))).not.toMatch(/from '\.\/time-grid'|from '@\/lib\/calendar\/time-grid'/);
    expect(leer(join('lib', 'calendar', 'time-grid.ts'))).toMatch(/from '\.\/paleta'/);
  });
});
