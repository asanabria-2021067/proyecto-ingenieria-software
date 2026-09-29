import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

// HU-154 (T-216): el detalle de proyecto pasa de una columna a 8/4 según el
// ancho del contenedor @container/project (no de la ventana), con el ancho
// y el espaciado del sistema de diseño. Sin capturas de píxeles: se congela
// la estructura, las clases del contrato y la regla CSS que genera Tailwind.

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '42' }),
  usePathname: () => '/dashboard/projects/42',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/components/projects/project-sidebar', () => ({
  ProjectSidebar: () => createElement('div', { 'data-testid': 'project-sidebar' }),
}));
vi.mock('@/components/projects/navigation/project-mobile-nav', () => ({
  ProjectMobileNav: () => createElement('div', { 'data-testid': 'project-mobile-nav' }),
}));
vi.mock('@/hooks/use-project-detail', () => ({ useProjectDetail: vi.fn() }));

import {
  ProjectContentGrid,
  ProjectGridAside,
  ProjectGridFull,
  ProjectGridMain,
} from '@/components/projects/detail/project-content-grid';
import ProjectLayout from '@/app/dashboard/projects/[id]/layout';
import ProyectoLayout from '@/app/dashboard/proyectos/[id]/layout';
import ProjectDetailClient from '@/app/dashboard/projects/[id]/project-detail-client';
import { useProjectDetail } from '@/hooks/use-project-detail';

function renderGrid() {
  return render(
    createElement(
      ProjectContentGrid,
      { 'data-testid': 'grid' } as any,
      createElement(ProjectGridFull, { 'data-testid': 'full' } as any, 'Encabezado'),
      createElement(ProjectGridMain, { 'data-testid': 'main' } as any, 'Principal'),
      createElement(ProjectGridAside, { 'aria-label': 'Apoyo' }, 'Lateral'),
    ),
  );
}

describe('ProjectContentGrid', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('arranca en una columna y pasa a 12 columnas por contenedor, con ancho y separación del sistema', () => {
    renderGrid();
    const grid = screen.getByTestId('grid');

    expect(grid).toHaveClass('grid', 'grid-cols-1', '@4xl/project:grid-cols-12', 'max-w-content', 'gap-grid', 'mx-auto');
    // Nunca por ventana: ni la primitiva global ni breakpoints lg/xl para las columnas.
    expect(grid.className).not.toMatch(/(^|\s)(lg|xl|md):grid-cols-/);
    expect(grid).not.toHaveClass('layout-grid');
    expect(grid.className).not.toContain('max-w-[1400px]');
  });

  it('encabezado a 12 columnas, principal a 8 y lateral a 4, solo desde el contenedor', () => {
    renderGrid();

    expect(screen.getByTestId('full')).toHaveClass('@4xl/project:col-span-12', 'min-w-0');
    expect(screen.getByTestId('main')).toHaveClass('@4xl/project:col-span-8', 'min-w-0');
    const aside = screen.getByRole('complementary', { name: 'Apoyo' });
    expect(aside).toHaveClass('@4xl/project:col-span-4', 'min-w-0');
  });

  it('conserva el orden encabezado → principal → lateral (así se apila en una columna)', () => {
    renderGrid();
    const hijos = Array.from(screen.getByTestId('grid').children).map((el) => el.textContent);
    expect(hijos).toEqual(['Encabezado', 'Principal', 'Lateral']);
  });

  it('acepta clases adicionales sin perder las del contrato', () => {
    render(createElement(ProjectContentGrid, { className: 'extra', 'data-testid': 'grid' } as any));
    expect(screen.getByTestId('grid')).toHaveClass('extra', '@4xl/project:grid-cols-12');
  });
});

describe('Contenedor @container/project en los layouts del proyecto', () => {
  afterEach(() => {
    cleanup();
  });

  it.each([
    ['/dashboard/projects/[id]', ProjectLayout],
    ['/dashboard/proyectos/[id]', ProyectoLayout],
  ])('%s declara el contenedor en el área de scroll, con la barra móvil antes del contenido', (_, Layout) => {
    render(createElement(Layout, null, createElement('main', null, 'Contenido')));

    const contenido = screen.getByRole('main');
    const scroll = contenido.parentElement as HTMLElement;
    expect(scroll).toHaveClass('@container/project', 'overflow-y-auto', 'min-w-0', 'flex-1');
    expect(scroll.firstElementChild).toBe(screen.getByTestId('project-mobile-nav'));
    // La sidebar del proyecto queda fuera del contenedor: no resta ancho a la medición.
    expect(scroll).not.toContainElement(screen.getByTestId('project-sidebar'));
  });

  it('la navegación contextual mantiene el corte en lg (sidebar lg:flex, barra móvil lg:hidden)', () => {
    const sidebar = readFileSync(join(__dirname, '..', 'components/projects/project-sidebar.tsx'), 'utf-8');
    const movil = readFileSync(join(__dirname, '..', 'components/projects/navigation/project-mobile-nav.tsx'), 'utf-8');
    expect(sidebar).toMatch(/hidden[^'"]*lg:flex/);
    expect(movil).toMatch(/lg:hidden/);
  });
});

describe('Skeleton del líder', () => {
  afterEach(() => {
    cleanup();
  });

  it('mientras carga usa la misma rejilla que la vista cargada', () => {
    (useProjectDetail as any).mockReturnValue({ data: undefined, isLoading: true, error: null, refetch: vi.fn() });
    render(createElement(ProjectDetailClient, { id: 42 }));

    const skeleton = screen.getByLabelText('Cargando proyecto');
    expect(skeleton).toHaveAttribute('aria-busy', 'true');
    expect(skeleton).toHaveAttribute('data-slot', 'project-content-grid');
    expect(skeleton.querySelector('[data-slot="project-grid-full"]')).not.toBeNull();
    expect(skeleton.querySelector('[data-slot="project-grid-main"]')).not.toBeNull();
    expect(skeleton.querySelector('[data-slot="project-grid-aside"]')).not.toBeNull();
  });
});

describe('CSS generado por Tailwind', () => {
  it('las variantes @4xl/project responden a un contenedor «project» de al menos 56rem', async () => {
    const postcss = (await import('postcss')).default;
    const tailwind = (await import('@tailwindcss/postcss')).default;
    const base = join(__dirname, '..');
    const entrada = readFileSync(join(base, 'app/global.css'), 'utf-8');
    const { css } = await postcss([tailwind({ base })]).process(entrada, { from: join(base, 'app/global.css') });

    expect(css).toContain('container-name: project');
    for (const clase of ['grid-cols-12', 'col-span-12', 'col-span-8', 'col-span-4']) {
      const regla = css.slice(css.indexOf(`.\\@4xl\\/project\\:${clase}`));
      expect(regla.slice(0, 200)).toMatch(/@container project \(width >= 56rem\)/);
    }
  }, 60_000);
});
