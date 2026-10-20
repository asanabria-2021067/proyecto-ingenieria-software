import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import {
  ADMIN_PAGE,
  ADMIN_PAGE_LEAD,
  ADMIN_PAGE_NARROW,
  ADMIN_PAGE_TITLE,
  ADMIN_PAGE_WIDTH,
} from '../components/admin/admin-page';
import { DATA_TABLE_CARD, DATA_TABLE_HEAD_ROW, DATA_TABLE_HEAD_TEXT, DataTablePager } from '../components/dashboard/data-table';
import { Tag } from '../components/ui/tag';
import { VISTAS_ADMIN, leer } from './helpers/admin-design';

/** FG07-C02 (T-320). Primitivas compartidas de las vistas administrativas. */

afterEach(cleanup);

describe('FG07-C02: primitivas de página', () => {
  it('conservan exactamente las clases que cada vista repetía: adoptarlas no cambia el aspecto', () => {
    expect(ADMIN_PAGE).toBe('mx-auto w-full max-w-[1400px] px-4 md:px-8 pb-12 pt-8');
    expect(ADMIN_PAGE_WIDTH).toBe('mx-auto w-full max-w-[1400px] px-4 md:px-8');
    expect(ADMIN_PAGE_NARROW).toBe('mx-auto w-full max-w-[1100px] px-4 md:px-8');
    expect(ADMIN_PAGE_TITLE).toBe('type-display text-balance');
    expect(ADMIN_PAGE_LEAD).toBe('mt-tight max-w-2xl text-base text-tertiary');
    // Mismo conjunto de clases que el literal anterior, solo en otro orden.
    expect(ADMIN_PAGE.split(' ').sort()).toEqual('mx-auto w-full max-w-[1400px] px-4 pb-12 pt-8 md:px-8'.split(' ').sort());
  });

  it.each(Object.entries(VISTAS_ADMIN))('%s toma el ancho de página de la primitiva, no de un literal', (_ruta, archivo) => {
    const fuente = leer(archivo);
    expect(fuente).toContain("from '@/components/admin/admin-page'");
    expect(fuente).not.toMatch(/max-w-\[1400px\]|max-w-\[1100px\]/);
  });

  it('las vistas con titular y párrafo de entrada estándar usan las primitivas', () => {
    const conTitular = Object.values(VISTAS_ADMIN).filter((archivo) => leer(archivo).includes('className={ADMIN_PAGE_TITLE}'));
    const conEntrada = Object.values(VISTAS_ADMIN).filter((archivo) => leer(archivo).includes('className={ADMIN_PAGE_LEAD}'));
    // Incluye la vista de cuentas pendientes (HU-179, PR #270), migrada a las primitivas al integrarla,
    // y la página propia de «Tendencias de uso». El catálogo temporal de etiquetas, que también usaba
    // el titular, se retiró del proyecto.
    expect(conTitular).toHaveLength(11);
    expect(conEntrada).toHaveLength(10);
    for (const archivo of Object.values(VISTAS_ADMIN)) {
      expect(leer(archivo), archivo).not.toContain('className="type-display text-balance"');
      expect(leer(archivo), archivo).not.toMatch(/className="mt-(2|tight) max-w-2xl text-base text-tertiary"/);
    }
  });

  it('no existe ya una constante local que duplique el ancho de página', () => {
    expect(leer('app/dashboard/admin/page.tsx')).toContain('const PAGE_CLASS = ADMIN_PAGE;');
    expect(leer('app/dashboard/admin/proyectos/[id]/cierre/closure-review-client.tsx')).toContain('const PAGE = ADMIN_PAGE_WIDTH;');
  });
});

describe('FG07-C02: primitivas que ya compartían las bandejas (sin cambios)', () => {
  it('la tabla sigue saliendo de los mismos tokens', () => {
    expect(DATA_TABLE_CARD).toBe('card-base overflow-hidden p-0');
    expect(DATA_TABLE_HEAD_ROW).toBe('border-b border-outline-variant/50 bg-surface-container-low');
    expect(DATA_TABLE_HEAD_TEXT).toBe('text-xs font-semibold text-text-secondary');
  });

  it('el paginador desactiva el extremo en el que está y nombra sus botones', () => {
    render(<DataTablePager pagina={1} totalPaginas={3} onPagina={() => undefined} label="Paginación de prueba" />);
    expect(screen.getByRole('navigation', { name: 'Paginación de prueba' })).toHaveClass('card-base');
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Página siguiente' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Página siguiente' })).toHaveClass('rounded-control');
  });

  it('la etiqueta estándar mantiene forma, tono y tamaño', () => {
    render(
      <>
        <Tag tone="success">Activo</Tag>
        <Tag tone="neutral" size="sm">
          Inactivo
        </Tag>
      </>,
    );
    expect(screen.getByText('Activo')).toHaveClass('pill', 'pill-success');
    expect(screen.getByText('Inactivo')).toHaveClass('pill', 'pill-sm', 'pill-neutral');
  });
});
