import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

let qActual = '';
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(qActual ? { q: qActual } : {}),
}));

const base = { descripcionProyecto: '', estadoProyecto: 'PUBLICADO', modalidadProyecto: 'MIXTA', organizaciones: [], intereses: [] };
const PROYECTOS = [
  { ...base, idProyecto: 1, tituloProyecto: 'Tutorías', tipoProyecto: 'ACADEMICO_HORAS_BECA', roles: [{ cupos: 2 }], mismaCarrera: true },
  { ...base, idProyecto: 2, tituloProyecto: 'Huerto', tipoProyecto: 'EXTRACURRICULAR_EXTENSION', roles: [{ cupos: 0 }] },
  { ...base, idProyecto: 3, tituloProyecto: 'App móvil', tipoProyecto: 'ACADEMICO_EXPERIENCIA', roles: [{ cupos: 1 }] },
  { ...base, idProyecto: 4, tituloProyecto: 'Archivo', tipoProyecto: 'ACADEMICO_EXPERIENCIA', estadoProyecto: 'CERRADO', roles: [{ cupos: 3 }] },
];

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/client', () => ({ apiFetch: apiFetchMock }));

// La tarjeta trae sus propios hooks (usuario, anclados); aquí solo importa qué proyectos se pintan.
vi.mock('@/components/projects/available-project-card', () => ({
  PROJECT_CARD_GRID: 'grid',
  AvailableProjectCardSkeleton: () => null,
  AvailableProjectCard: ({ proyecto }: { proyecto: { tituloProyecto: string } }) => <article>{proyecto.tituloProyecto}</article>,
}));

async function renderPage(q = '') {
  qActual = q;
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation(async (ruta: string) => (ruta.startsWith('/organizaciones') ? [] : PROYECTOS));
  const { default: Page } = await import('../app/dashboard/proyectos/page');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Page />
    </QueryClientProvider>,
  );
  await screen.findByRole('group', { name: 'Filtros de proyectos' });
}

afterEach(cleanup);

describe('Explorar: filtros visibles', () => {
  it('muestra los tipos reales como botones aria-pressed y filtra al pulsarlos', async () => {
    await renderPage();
    for (const nombre of [/^Horas Beca/, /^Experiencia/, /^Extensión/, /^Con vacantes/]) {
      expect(screen.getByRole('button', { name: nombre })).toHaveAttribute('aria-pressed', 'false');
    }
    fireEvent.click(screen.getByRole('button', { name: /^Extensión/ }));
    expect(screen.getByRole('button', { name: /^Extensión/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('Tutorías')).not.toBeInTheDocument();
    expect(screen.getByText('Huerto')).toBeInTheDocument();
  });

  it('«Con vacantes» oculta los proyectos sin cupos y «De tu carrera» los que no piden tu carrera', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Con vacantes' }));
    expect(screen.queryByText('Huerto')).not.toBeInTheDocument();
    expect(screen.getByText('App móvil')).toBeInTheDocument();
    expect(screen.queryByText('Archivo')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'De tu carrera' }));
    expect(screen.queryByText('App móvil')).not.toBeInTheDocument();
    expect(screen.getByText('Tutorías')).toBeInTheDocument();
  });

  it('lee ?q= de la URL y aplica el texto', async () => {
    await renderPage('huerto');
    expect(screen.getByRole('textbox', { name: /Buscar proyectos/ })).toHaveValue('huerto');
    expect(screen.getByText('Huerto')).toBeInTheDocument();
    expect(screen.queryByText('Tutorías')).not.toBeInTheDocument();
  });

  it('sin resultados ofrece quitar el texto y limpiar los filtros', async () => {
    await renderPage('zzz');
    await waitFor(() => expect(screen.getByText('Sin resultados')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Quitar el texto' }));
    expect(screen.getByText('Tutorías')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Con vacantes' }));
    fireEvent.change(screen.getByRole('textbox', { name: /Buscar proyectos/ }), { target: { value: 'zzz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros y ver todos' }));
    expect(screen.getByText('Huerto')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Con vacantes' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('con ?q= pide el texto al backend (que filtra por título y devuelve solo 20)', async () => {
    await renderPage('huerto');
    expect(apiFetchMock).toHaveBeenCalledWith('/proyectos?q=huerto');
  });

  it('al reescribir el texto quita q de la URL y conserva lo escrito', async () => {
    const replace = vi.spyOn(window.history, 'replaceState');
    await renderPage('huerto');
    const campo = screen.getByRole('textbox', { name: /Buscar proyectos/ });
    fireEvent.change(campo, { target: { value: 'tutor' } });
    expect(replace).toHaveBeenCalledWith(null, '', window.location.pathname);
    expect(campo).toHaveValue('tutor');
    replace.mockRestore();
  });
});
