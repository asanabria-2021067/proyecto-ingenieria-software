import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '42' }),
}));

vi.mock('../hooks/use-current-user', () => ({ useCurrentUser: vi.fn(), useIsAdmin: vi.fn() }));
vi.mock('../hooks/use-project-detail', () => ({ useProjectDetail: vi.fn() }));
vi.mock('../hooks/use-is-project-leader', () => ({ useIsProjectLeader: vi.fn() }));
vi.mock('../hooks/use-project-export', () => ({ useProjectExport: vi.fn() }));

import ReportesProyectoPage from '../app/dashboard/proyectos/[id]/reportes/page';
import { useCurrentUser, useIsAdmin } from '../hooks/use-current-user';
import { useProjectDetail } from '../hooks/use-project-detail';
import { useIsProjectLeader } from '../hooks/use-is-project-leader';
import { useProjectExport } from '../hooks/use-project-export';

function renderPage() {
  return render(createElement(ReportesProyectoPage));
}

beforeEach(() => {
  (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 1 }, isLoading: false });
  (useProjectDetail as any).mockReturnValue({
    data: { idProyecto: 42, tituloProyecto: 'Sistema de Bibliotecas', creador: { idUsuario: 1 } },
    isLoading: false,
  });
  (useIsAdmin as any).mockReturnValue(false);
  (useProjectExport as any).mockReturnValue({
    exportCsv: { mutate: vi.fn(), isPending: false, isError: false },
    exportPdf: { mutate: vi.fn(), isPending: false, isError: false },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ReportesProyectoPage (T-259/T-260)', () => {
  it('el líder ve el título del proyecto y los botones de exportar', () => {
    (useIsProjectLeader as any).mockReturnValue(true);

    renderPage();

    expect(screen.getByText(/Sistema de Bibliotecas/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /exportar csv/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /exportar pdf/i })).toBeInTheDocument();
  });

  it('exportar vive en un solo lugar: las acciones del encabezado, no debajo de las tarjetas', () => {
    (useIsProjectLeader as any).mockReturnValue(true);

    renderPage();

    expect(screen.getAllByRole('button', { name: /exportar csv/i })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /exportar pdf/i })).toHaveLength(1);
    const acciones = screen
      .getByRole('button', { name: /exportar csv/i })
      .closest('[data-slot="project-page-actions"]');
    expect(acciones).not.toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Reportes' }).closest('header')).toContainElement(
      acciones as HTMLElement,
    );
  });

  it('usa el shell estándar del proyecto: sin contenedor centrado más estrecho', () => {
    (useIsProjectLeader as any).mockReturnValue(true);

    const { container } = renderPage();

    const shell = container.querySelector('[data-slot="project-page-shell"]') as HTMLElement;
    expect(shell).toHaveClass('max-w-content');
    expect(container.innerHTML).not.toMatch(/max-w-\[900px\]/);
    const tarjeta = screen.getByRole('heading', { level: 2, name: 'CSV de miembros y horas' }).closest('.card-base');
    expect(tarjeta?.parentElement).toHaveClass('grid', '@2xl/project:grid-cols-2');
  });

  it('un integrante que no es líder ve el aviso de acceso exclusivo, no los botones', () => {
    (useIsProjectLeader as any).mockReturnValue(false);

    renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent(/no puedes exportar/i);
    expect(screen.queryByRole('button', { name: /exportar csv/i })).not.toBeInTheDocument();
  });
});
