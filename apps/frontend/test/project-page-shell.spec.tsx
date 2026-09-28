import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Users } from 'lucide-react';
import {
  PROJECT_PAGE_CLASS,
  ProjectBackLink,
  ProjectPageHeader,
  ProjectPageShell,
} from '../components/projects/detail/project-page-shell';
import { ProjectContentGrid } from '../components/projects/detail/project-content-grid';

// Una sola geometría y un solo encabezado para las vistas internas del
// proyecto: mismo ancho, gutter, aire vertical, título, descripción, vuelta y
// posición de acciones.
describe('ProjectPageShell / ProjectPageHeader', () => {
  afterEach(() => cleanup());

  it('la geometría es la del sistema de diseño: max-w-content centrado, gutter y aire compartidos', () => {
    expect(PROJECT_PAGE_CLASS.split(' ')).toEqual([
      'mx-auto',
      'w-full',
      'max-w-content',
      'px-stack',
      'py-section',
      'lg:px-section',
    ]);
    expect(PROJECT_PAGE_CLASS).not.toMatch(/max-w-\[/);
  });

  it('el shell y la rejilla del Resumen comparten exactamente la misma geometría', () => {
    render(
      <>
        <ProjectPageShell data-testid="shell" />
        <ProjectContentGrid data-testid="grid" />
      </>,
    );
    for (const clase of PROJECT_PAGE_CLASS.split(' ')) {
      expect(screen.getByTestId('shell')).toHaveClass(clase);
      expect(screen.getByTestId('grid')).toHaveClass(clase);
    }
  });

  it('el encabezado muestra vuelta, título, descripción, datos extra y acciones en su lugar', () => {
    render(
      <ProjectPageHeader
        back={{ href: '/dashboard/projects/7', label: 'Volver al proyecto' }}
        title="Miembros"
        description="Integrantes del proyecto."
        icon={Users}
        actions={<button type="button">Exportar CSV</button>}
      >
        <p>Líder: Ana</p>
      </ProjectPageHeader>,
    );

    const encabezado = screen.getByRole('banner');
    expect(encabezado).toHaveClass('mb-section');
    expect(screen.getByRole('link', { name: 'Volver al proyecto' })).toHaveAttribute('href', '/dashboard/projects/7');
    const titulo = screen.getByRole('heading', { level: 1, name: 'Miembros' });
    expect(titulo).toHaveClass('type-display', 'text-text-primary');
    expect(titulo.closest('.card-base')).toBeNull();
    expect(screen.getByText('Integrantes del proyecto.')).toHaveClass('type-body', 'text-text-secondary');
    expect(screen.getByText('Líder: Ana')).toBeInTheDocument();
    const acciones = screen.getByRole('button', { name: 'Exportar CSV' }).parentElement!;
    expect(acciones).toHaveAttribute('data-slot', 'project-page-actions');
    // a la derecha cuando el contenedor del proyecto tiene ancho; debajo si no
    expect(acciones.parentElement).toHaveClass('flex-col', '@3xl/project:flex-row', '@3xl/project:justify-between');
    expect(encabezado.querySelector('h1')!.previousElementSibling).toHaveClass('size-6', 'text-primary');
  });

  it('sin vuelta, descripción ni acciones solo queda el título', () => {
    render(<ProjectPageHeader title="Tablero" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(document.querySelector('[data-slot="project-page-actions"]')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Tablero' })).toBeInTheDocument();
  });

  it('la vuelta también existe suelta para páginas con aviso de acceso', () => {
    render(<ProjectBackLink href="/dashboard/proyectos/7/sprints" label="Volver a Sprints" />);
    const vuelta = screen.getByRole('link', { name: 'Volver a Sprints' });
    expect(vuelta).toHaveClass('text-text-secondary', 'hover:text-primary');
    expect(vuelta.querySelector('svg')).toHaveClass('size-4');
  });
});

// Vistas internas del proyecto que ya usan el shell y el encabezado compartidos.
const VISTAS_MIGRADAS = [
  'app/dashboard/proyectos/[id]/sprints/page.tsx',
  'app/dashboard/proyectos/[id]/sprints/analytics/page.tsx',
  'app/dashboard/proyectos/[id]/sprints/[sprintId]/analytics/page.tsx',
  'app/dashboard/proyectos/[id]/miembros/page.tsx',
  'app/dashboard/proyectos/[id]/miembros/postulaciones/page.tsx',
  'app/dashboard/proyectos/[id]/miembros/solicitudes-salida/page.tsx',
  'app/dashboard/proyectos/[id]/liderazgo/page.tsx',
  'app/dashboard/proyectos/[id]/bitacora/page.tsx',
];

const leer = (ruta: string) => readFileSync(join(__dirname, '..', ruta), 'utf-8');

describe('Vistas del proyecto sobre el shell compartido', () => {
  it.each(VISTAS_MIGRADAS)('%s usa ProjectPageShell y ProjectPageHeader', (ruta) => {
    const fuente = leer(ruta);
    expect(fuente).toMatch(/<ProjectPageShell>/);
    expect(fuente).toMatch(/<ProjectPageHeader\b/);
  });

  it.each(VISTAS_MIGRADAS)('%s no vuelve a fijar su propio ancho, gutter ni vuelta', (ruta) => {
    const fuente = leer(ruta);
    expect(fuente).not.toMatch(/max-w-\[1400px\]|max-w-\[900px\]/);
    expect(fuente).not.toMatch(/px-4 pb-12 pt-8 md:px-8/);
    expect(fuente).not.toMatch(/<ArrowLeft\b/);
  });
});
