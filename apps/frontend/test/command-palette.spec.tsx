import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const searchGlobalMock = vi.fn();
const pushMock = vi.fn();

vi.mock('@/lib/services/global-search', () => ({ searchGlobal: (q: string) => searchGlobalMock(q) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));

const vacio = { items: [], hasMore: false };
const destinos = [
  { href: '/dashboard/mis-tareas', label: 'Mis Tareas' },
  { href: '/dashboard/mis-horas', label: 'Mis Horas' },
];

beforeEach(() => {
  // cmdk usa estas APIs, que jsdom no trae.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView ??= () => {};
  searchGlobalMock.mockResolvedValue({
    proyectos: {
      items: [{ idProyecto: 4, tituloProyecto: 'Feria de Ciencias', tipoProyecto: 'X', modalidadProyecto: 'Y' }],
      hasMore: false,
    },
    personas: vacio,
    tareas: {
      items: [
        { idTarea: 9, tituloTarea: 'Armar stand', idProyecto: 4, tituloProyecto: 'Feria de Ciencias', estadoTarea: 'POR_HACER' },
      ],
      hasMore: false,
    },
    mensajes: vacio,
  });
});
afterEach(cleanup);

async function montar() {
  const { CommandPalette } = await import('@/components/layout/command-palette');
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <CommandPalette destinos={destinos} />
    </QueryClientProvider>,
  );
}

describe('CommandPalette (MEJ-73)', () => {
  it('Ctrl+K abre y cierra; Cmd+K tambien', async () => {
    await montar();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.keyDown(window, { key: 'K', metaKey: true });
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('K sin modificador no la abre', async () => {
    await montar();
    fireEvent.keyDown(window, { key: 'k' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('lista los destinos del rol y filtra sin acentos', async () => {
    await montar();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(await screen.findByText('Mis Tareas')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'hóras' } });
    await waitFor(() => expect(screen.queryByText('Mis Tareas')).toBeNull());
    expect(screen.getByText('Mis Horas')).toBeInTheDocument();
  });

  it('muestra las tareas de la busqueda del servidor y navega al elegir', async () => {
    await montar();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: 'feria' } });
    fireEvent.click(await screen.findByText('Armar stand'));
    expect(pushMock).toHaveBeenCalledWith('/dashboard/projects/4/kanban/tasks/9');
    expect(searchGlobalMock).toHaveBeenCalledWith('feria');
  });

  it('lista mensajes y canales y no dice "sin coincidencias" si solo hay de esos', async () => {
    searchGlobalMock.mockResolvedValue({
      proyectos: vacio,
      personas: vacio,
      tareas: vacio,
      mensajes: { items: [{ idConversacion: 9, nombre: '#Demo', esCanal: true, tituloProyecto: 'Hackathon' }], hasMore: false },
    });
    await montar();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: 'patrocinadores' } });
    fireEvent.click(await screen.findByText('#Demo'));
    expect(screen.queryByText(/Sin coincidencias/)).not.toBeInTheDocument();
    expect(pushMock).toHaveBeenCalledWith('/dashboard/mensajes/9');
  });

  it('sin coincidencias ofrece un mensaje', async () => {
    searchGlobalMock.mockResolvedValue({ proyectos: vacio, personas: vacio, tareas: vacio, mensajes: vacio });
    await montar();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: 'zzzz' } });
    expect(await screen.findByText(/Sin coincidencias/)).toBeInTheDocument();
  });
});
