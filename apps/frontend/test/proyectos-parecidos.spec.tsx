import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/client', () => ({ apiFetch: apiFetchMock }));
vi.mock('@/components/projects/available-project-card', () => ({
  PROJECT_CARD_GRID: 'grid',
  AvailableProjectCard: ({ proyecto }: { proyecto: { tituloProyecto: string } }) => <article>{proyecto.tituloProyecto}</article>,
}));

import { ProyectosParecidos } from '@/components/projects/proyectos-parecidos';

function renderSeccion() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ProyectosParecidos idProyecto={5} />
    </QueryClientProvider>,
  );
}

describe('Proyectos parecidos (MEJ-93)', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('muestra hasta 6 tarjetas cuando el endpoint devuelve resultados', async () => {
    apiFetchMock.mockResolvedValue(Array.from({ length: 8 }, (_, i) => ({ idProyecto: i + 1, tituloProyecto: `Proyecto ${i + 1}` })));
    renderSeccion();
    expect(await screen.findByRole('region', { name: 'Proyectos parecidos' })).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(6);
    expect(apiFetchMock).toHaveBeenCalledWith('/proyectos/5/similares');
  });

  it('no pinta nada si no hay resultados', async () => {
    apiFetchMock.mockResolvedValue([]);
    renderSeccion();
    await vi.waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    expect(screen.queryByText('Proyectos parecidos')).toBeNull();
  });

  it('no pinta nada si el servidor responde con error (404)', async () => {
    apiFetchMock.mockRejectedValue(new Error('no encontrado'));
    renderSeccion();
    await vi.waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    expect(screen.queryByText('Proyectos parecidos')).toBeNull();
  });
});
