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

const vacio = { items: [], hasMore: false };

async function renderInput() {
  const { GlobalSearchInput } = await import('@/components/layout/global-search-input');
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <GlobalSearchInput />
    </QueryClientProvider>,
  );
}

function escribir(valor: string) {
  const input = screen.getByRole('combobox', { name: /buscar/i });
  fireEvent.change(input, { target: { value: valor } });
  return input;
}

// Las coincidencias van en <mark>, que parte el nombre accesible: se busca por textContent.
function opcionGet(texto: RegExp): HTMLElement {
  const encontrada = screen.getAllByRole('option').find((o) => texto.test(o.textContent ?? ''));
  if (!encontrada) throw new Error(`No hay opcion que coincida con ${texto}`);
  return encontrada;
}

function opcionFind(texto: RegExp): Promise<HTMLElement> {
  return waitFor(() => opcionGet(texto));
}

beforeEach(() => {
  vi.useRealTimers();
  searchGlobalMock.mockReset();
  pushMock.mockReset();
  searchGlobalMock.mockResolvedValue({ proyectos: vacio, personas: vacio, tareas: vacio });
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

    escribir('a');

    expect(await screen.findByRole('group', { name: 'Proyectos' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Personas' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Tareas' })).toBeInTheDocument();
    expect(opcionGet(/App móvil/)).toBeInTheDocument();
    expect(opcionGet(/Ana Pérez/)).toBeInTheDocument();
    expect(opcionGet(/Login/)).toBeInTheDocument();
  });

  it('muestra pestañas con contador por tipo y filtra al elegir una', async () => {
    searchGlobalMock.mockResolvedValue({
      proyectos: { items: [{ idProyecto: 1, tituloProyecto: 'Proyecto uno', tipoProyecto: 'SOCIAL', modalidadProyecto: 'MIXTA' }], hasMore: false },
      personas: {
        items: [
          { idUsuario: 2, nombre: 'Ana', apellido: 'Uno', fotoUrl: null, carrera: null },
          { idUsuario: 3, nombre: 'Beto', apellido: 'Uno', fotoUrl: null, carrera: null },
        ],
        hasMore: true,
      },
      tareas: vacio,
    });
    await renderInput();
    escribir('uno');
    await opcionFind(/Proyecto uno/);

    expect(screen.getByRole('tab', { name: /Todo\s*3\+/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Proyectos\s*1$/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Personas\s*2\+/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Personas/ }));

    expect(screen.getAllByRole('option').some((o) => /Proyecto uno/.test(o.textContent ?? ''))).toBe(false);
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  it('resalta la coincidencia ignorando acentos y mayusculas', async () => {
    searchGlobalMock.mockResolvedValue({
      proyectos: vacio,
      personas: { items: [{ idUsuario: 2, nombre: 'José', apellido: 'Ramírez', fotoUrl: null, carrera: null }], hasMore: false },
      tareas: vacio,
    });
    await renderInput();
    escribir('RAMIREZ');

    const marca = await screen.findByText('Ramírez', { selector: 'mark' });
    expect(marca).toBeInTheDocument();
  });

  it('el enlace Limpiar vacia el campo y cierra los resultados', async () => {
    await renderInput();
    const input = escribir('zzz');
    expect(input).toHaveValue('zzz');

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }));

    expect(input).toHaveValue('');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('navega con flechas y abre el resultado seleccionado con Enter', async () => {
    searchGlobalMock.mockResolvedValue({
      proyectos: { items: [{ idProyecto: 1, tituloProyecto: 'Primero', tipoProyecto: 'SOCIAL', modalidadProyecto: 'MIXTA' }], hasMore: false },
      personas: { items: [{ idUsuario: 2, nombre: 'Segundo', apellido: 'Persona', fotoUrl: null, carrera: null }], hasMore: false },
      tareas: vacio,
    });
    await renderInput();
    const input = escribir('a');
    await opcionFind(/Primero/);

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(pushMock).toHaveBeenCalledWith('/dashboard/personas/2');
  });

  it('no muestra "sin coincidencias" antes de que la busqueda se resuelva, solo despues', async () => {
    let resolver: (value: unknown) => void = () => {};
    searchGlobalMock.mockReturnValue(new Promise((resolve) => { resolver = resolve; }));
    await renderInput();

    escribir('zzz');
    expect(screen.queryByText(/sin coincidencias/i)).not.toBeInTheDocument();

    resolver({ proyectos: vacio, personas: vacio, tareas: vacio });

    expect(await screen.findByText(/sin coincidencias/i)).toBeInTheDocument();
  });

  it('muestra estado de carga mientras consulta', async () => {
    let resolver: (value: unknown) => void = () => {};
    searchGlobalMock.mockReturnValue(new Promise((resolve) => { resolver = resolve; }));
    await renderInput();

    escribir('a');

    expect(await screen.findByRole('status', { name: /buscando/i })).toBeInTheDocument();
    resolver({ proyectos: vacio, personas: vacio, tareas: vacio });
  });

  it('avisa cuando un grupo tiene mas resultados de los mostrados', async () => {
    searchGlobalMock.mockResolvedValue({
      proyectos: { items: [{ idProyecto: 1, tituloProyecto: 'Uno de varios', tipoProyecto: 'SOCIAL', modalidadProyecto: 'MIXTA' }], hasMore: true },
      personas: vacio,
      tareas: vacio,
    });
    await renderInput();

    escribir('a');

    expect(await opcionFind(/Uno de varios/)).toBeInTheDocument();
    expect(screen.getByText(/hay más resultados/i)).toBeInTheDocument();
  });

  it('actualiza aria-activedescendant al navegar con flechas', async () => {
    searchGlobalMock.mockResolvedValue({
      proyectos: { items: [{ idProyecto: 1, tituloProyecto: 'Primero', tipoProyecto: 'SOCIAL', modalidadProyecto: 'MIXTA' }], hasMore: false },
      personas: vacio,
      tareas: vacio,
    });
    await renderInput();
    const input = escribir('a');
    await opcionFind(/Primero/);
    expect(input).not.toHaveAttribute('aria-activedescendant');

    fireEvent.keyDown(input, { key: 'ArrowDown' });

    const opcion = opcionGet(/Primero/i);
    expect(input).toHaveAttribute('aria-activedescendant', opcion.id);
  });

  it('genera ids de DOM unicos por instancia (permite montar escritorio y movil a la vez)', async () => {
    searchGlobalMock.mockResolvedValue({
      proyectos: { items: [{ idProyecto: 1, tituloProyecto: 'X', tipoProyecto: 'SOCIAL', modalidadProyecto: 'MIXTA' }], hasMore: false },
      personas: vacio,
      tareas: vacio,
    });
    const { GlobalSearchInput } = await import('@/components/layout/global-search-input');
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <GlobalSearchInput />
        <GlobalSearchInput />
      </QueryClientProvider>,
    );
    const inputs = screen.getAllByRole('combobox', { name: /buscar/i });
    fireEvent.change(inputs[0], { target: { value: 'a' } });
    fireEvent.change(inputs[1], { target: { value: 'a' } });

    await waitFor(() => expect(screen.getAllByRole('listbox')).toHaveLength(2));

    const [primero, segundo] = screen.getAllByRole('listbox');
    expect(primero.id).not.toBe(segundo.id);
  });
});
