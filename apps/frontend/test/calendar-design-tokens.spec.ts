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

/**
 * G05.1-C01 (G05-HALLAZGO-01): `status-error` es un color de SUPERFICIE (error-container). Usado como
 * color de texto dejaba los errores del calendario y el botón "Eliminar evento" en 1.2–1.3:1 (claro) y
 * ~2:1 (oscuro). El texto de error usa `on-status-error`; las superficies y bordes de error no cambian.
 */
describe('calendario — texto de error legible (G05.1-C01, G05-HALLAZGO-01)', () => {
  const css = leer(join('app', 'global.css'));
  const bloque = (encabezado: string) => {
    const abre = css.indexOf('{', css.indexOf(encabezado));
    let profundidad = 0;
    for (let i = abre; i < css.length; i += 1) {
      if (css[i] === '{') profundidad += 1;
      else if (css[i] === '}' && --profundidad === 0) return css.slice(abre + 1, i);
    }
    return '';
  };
  const token = (tema: string, nombre: string) => (tema.match(new RegExp(`--color-${nombre}:\\s*(#[0-9a-fA-F]{6})\\b`)) as RegExpMatchArray)[1];
  const rgb = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  const luminancia = (c: number[]) => {
    const [r, g, b] = c.map((v) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contraste = (a: number[], b: number[]) => {
    const [clara, oscura] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
    return (clara + 0.05) / (oscura + 0.05);
  };
  /** `encima` pintado con opacidad `alfa` sobre `debajo` (bg-status-error/10 sobre la tarjeta del diálogo). */
  const mezclar = (encima: number[], debajo: number[], alfa: number) => encima.map((v, i) => v * alfa + debajo[i] * (1 - alfa));
  const TEMAS = [
    ['claro', bloque('@theme {')],
    ['oscuro', bloque('.dark {')],
  ] as const;

  it('los alias no cambian: status-error es la superficie (error-container) y on-status-error el texto (error)', () => {
    expect(css).toMatch(/--color-status-error:\s*var\(--color-error-container\)/);
    expect(css).toMatch(/--color-on-status-error:\s*var\(--color-error\)/);
  });

  it.each(TEMAS)('tema %s: on-status-error alcanza 4.5:1 sobre cada superficie donde el calendario escribe errores', (_nombre, tema) => {
    const texto = rgb(token(tema, 'error'));
    for (const superficie of ['surface-container-lowest', 'surface-container-low', 'surface', 'surface-container', 'surface-container-high']) {
      expect(contraste(texto, rgb(token(tema, superficie))), superficie).toBeGreaterThanOrEqual(4.5);
    }
    // La alerta del formulario: fondo de error al 10 % sobre la tarjeta del diálogo.
    const alerta = mezclar(rgb(token(tema, 'error-container')), rgb(token(tema, 'surface-container-lowest')), 0.1);
    expect(contraste(texto, alerta)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(TEMAS)('tema %s: el color de superficie usado como texto no llega ni a 3:1 (por eso era ilegible)', (_nombre, tema) => {
    const superficieDeError = rgb(token(tema, 'error-container'));
    for (const fondo of ['surface-container-lowest', 'surface']) expect(contraste(superficieDeError, rgb(token(tema, fondo)))).toBeLessThan(3);
  });

  it('ningún componente del calendario usa status-error como color de texto, ni en reposo ni al pasar el cursor', () => {
    const usos = ARCHIVOS.flatMap((ruta) =>
      leer(ruta)
        .split('\n')
        .map((linea, i) => ({ ruta, linea: i + 1, texto: linea }))
        .filter(({ texto }) => /(^|[\s"'`:])text-status-error\b/.test(texto)),
    );
    expect(usos.map((u) => `${u.ruta}:${u.linea}`)).toEqual([]);
  });

  it('los diez textos de error usan on-status-error y las superficies de error siguen en su sitio', () => {
    const cuenta = (ruta: string, clase: RegExp) => (leer(join('components', 'calendar', ruta)).match(clase) ?? []).length;
    const TEXTO = /(?<![\w-])(?:hover:)?text-on-status-error\b/g;
    expect({
      detalle: cuenta('event-detail-dialog.tsx', TEXTO),
      formulario: cuenta('event-form-dialog.tsx', TEXTO),
      ubicacion: cuenta('event-location-picker.tsx', TEXTO),
      compartir: cuenta('share-calendar-dialog.tsx', TEXTO),
      columna: cuenta('calendar-sidebar.tsx', TEXTO),
    }).toEqual({ detalle: 1, formulario: 3, ubicacion: 1, compartir: 4, columna: 3 });
    // La alerta del formulario conserva su borde y su fondo de error.
    expect(leer(join('components', 'calendar', 'event-form-dialog.tsx'))).toMatch(/border-status-error\/40 bg-status-error\/10 [^"]*text-on-status-error/);
  });
});
