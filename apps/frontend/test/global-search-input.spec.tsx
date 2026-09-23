import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const searchGlobalMock = vi.fn();
const pushMock = vi.fn();

vi.mock('@/lib/services/global-search', () => ({
  searchGlobal: (q: string) => searchGlobalMock(q),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

async function renderInput() {
  const { GlobalSearchInput } = await import('@/components/layout/global-search-input');
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <GlobalSearchInput />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.useRealTimers();
  searchGlobalMock.mockReset();
  pushMock.mockReset();
  searchGlobalMock.mockResolvedValue({
    proyectos: { items: [], hasMore: false },
    personas: { items: [], hasMore: false },
    tareas: { items: [], hasMore: false },
  });
});

describe('GlobalSearchInput', () => {
  it('no consulta mientras el usuario escribe, solo tras dejar de escribir (debounce)', async () => {
    await renderInput();
    const input = screen.getByRole('combobox', { name: /buscar/i });

    fireEvent.change(input, { target: { value: 'r' } });
    fireEvent.change(input, { target: { value: 're' } });
    fireEvent.change(input, { target: { value: 'react' } });

    await waitFor(() => expect(searchGlobalMock).toHaveBeenCalledTimes(1));
    expect(searchGlobalMock).toHaveBeenCalledWith('react');
  });

  it('agrupa resultados con encabezado por tipo', async () => {
    searchGlobalMock.mockResolvedValue({
      proyectos: { items: [{ idProyecto: 1, tituloProyecto: 'App móvil', tipoProyecto: 'SOCIAL', modalidadProyecto: 'MIXTA' }], hasMore: false },
      personas: { items: [{ idUsuario: 2, nombre: 'Ana', apellido: 'Pérez', fotoUrl: null, carrera: null }], hasMore: false },
      tareas: { items: [{ idTarea: 3, tituloTarea: 'Login', idProyecto: 4, tituloProyecto: 'Otro proyecto', estadoTarea: 'POR_HACER' }], hasMore: false },
    });
    await renderInput();

    fireEvent.change(screen.getByRole('combobox', { name: /buscar/i }), { target: { value: 'a' } });

    expect(await screen.findByText('Proyectos')).toBeInTheDocument();
    expect(screen.getByText('Personas')).toBeInTheDocument();
    expect(screen.getByText('Tareas')).toBeInTheDocument();
    expect(screen.getByText('App móvil')).toBeInTheDocument();
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument();
    expect(screen.getByText('Login')).toBeInTheDocument();
  });

  it('navega con flechas y abre el resultado seleccionado con Enter', async () => {
    searchGlobalMock.mockResolvedValue({
      proyectos: { items: [{ idProyecto: 1, tituloProyecto: 'Primero', tipoProyecto: 'SOCIAL', modalidadProyecto: 'MIXTA' }], hasMore: false },
      personas: { items: [{ idUsuario: 2, nombre: 'Segundo', apellido: 'Persona', fotoUrl: null, carrera: null }], hasMore: false },
      tareas: { items: [], hasMore: false },
    });
    await renderInput();
    const input = screen.getByRole('combobox', { name: /buscar/i });
    fireEvent.change(input, { target: { value: 'a' } });
    await screen.findByText('Primero');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(pushMock).toHaveBeenCalledWith('/dashboard/personas/2');
  });

  it('muestra un estado vacio cuando no hay coincidencias', async () => {
    await renderInput();
    fireEvent.change(screen.getByRole('combobox', { name: /buscar/i }), { target: { value: 'zzz' } });

    expect(await screen.findByText(/sin coincidencias/i)).toBeInTheDocument();
  });

  it('muestra estado de carga mientras consulta', async () => {
    let resolver: (value: unknown) => void = () => {};
    searchGlobalMock.mockReturnValue(new Promise((resolve) => { resolver = resolve; }));
    await renderInput();

    fireEvent.change(screen.getByRole('combobox', { name: /buscar/i }), { target: { value: 'a' } });

    expect(await screen.findByRole('status', { name: /buscando/i })).toBeInTheDocument();
    resolver({ proyectos: { items: [], hasMore: false }, personas: { items: [], hasMore: false }, tareas: { items: [], hasMore: false } });
  });
});
