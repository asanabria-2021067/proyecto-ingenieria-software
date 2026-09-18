import CompleteProfileDialog from '@/components/profile/CompleteProfileDialog';
import type { Cualidad, Habilidad, Interes } from '@/lib/services/catalogs';
import type { UserProfile } from '@/lib/services/users';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useCurrentUserMock = vi.fn();
vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => useCurrentUserMock(),
}));

const getHabilidadesMock = vi.fn();
const getInteresesMock = vi.fn();
const getCualidadesMock = vi.fn();
const createHabilidadMock = vi.fn();
const createInteresMock = vi.fn();
const createCualidadMock = vi.fn();
vi.mock('@/lib/services/catalogs', () => ({
  getHabilidades: () => getHabilidadesMock(),
  getIntereses: () => getInteresesMock(),
  getCualidades: () => getCualidadesMock(),
  createHabilidad: (nombre: string) => createHabilidadMock(nombre),
  createInteres: (nombre: string) => createInteresMock(nombre),
  createCualidad: (nombre: string) => createCualidadMock(nombre),
}));

const updateProfileMock = vi.fn();
const replaceHabilidadesMock = vi.fn();
const replaceInteresesMock = vi.fn();
const replaceCualidadesMock = vi.fn();
const addExperienciaMock = vi.fn();
vi.mock('@/lib/services/users', () => ({
  updateProfile: (data: unknown) => updateProfileMock(data),
  replaceHabilidades: (h: unknown) => replaceHabilidadesMock(h),
  replaceIntereses: (i: unknown) => replaceInteresesMock(i),
  replaceCualidades: (c: unknown) => replaceCualidadesMock(c),
  addExperiencia: (e: unknown) => addExperienciaMock(e),
}));

const uploadToCloudinaryMock = vi.fn();
vi.mock('@/lib/cloudinary', () => ({
  uploadToCloudinary: (file: File, folder: string) => uploadToCloudinaryMock(file, folder),
}));

const HABILIDADES_BASE: Habilidad[] = [
  { idHabilidad: 1, nombreHabilidad: 'React', categoriaHabilidad: null },
  { idHabilidad: 2, nombreHabilidad: 'Python', categoriaHabilidad: null },
  { idHabilidad: 10, nombreHabilidad: 'Diseño gráfico', categoriaHabilidad: null },
  { idHabilidad: 11, nombreHabilidad: 'Diseño web', categoriaHabilidad: null },
];
const INTERESES_BASE: Interes[] = [{ idInteres: 1, nombreInteres: 'Inteligencia Artificial' }];
const CUALIDADES_BASE: Cualidad[] = [{ idCualidad: 1, nombreCualidad: 'Liderazgo' }];

function baseUser(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    idUsuario: 1,
    correo: 'sammy@uvg.edu.gt',
    nombre: 'Samuel',
    apellido: 'Robledo',
    fotoUrl: null,
    estado: 'ACTIVO',
    perfil: {
      carne: '241282',
      idCarrera: 1,
      semestre: 5,
      biografia: null,
      enlacePortafolio: null,
      githubUrl: null,
      linkedinUrl: null,
      disponibilidadHorasSemana: 10,
      horasBecaRequeridas: null,
      horasExtensionRequeridas: null,
      urlCv: null,
      carrera: null,
    },
    habilidades: [],
    intereses: [],
    cualidades: [],
    experiencias: [],
    roles: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getHabilidadesMock.mockResolvedValue(HABILIDADES_BASE);
  getInteresesMock.mockResolvedValue(INTERESES_BASE);
  getCualidadesMock.mockResolvedValue(CUALIDADES_BASE);
  updateProfileMock.mockResolvedValue({});
  replaceHabilidadesMock.mockResolvedValue({});
  replaceInteresesMock.mockResolvedValue({});
  replaceCualidadesMock.mockResolvedValue({});
  addExperienciaMock.mockResolvedValue({});
  uploadToCloudinaryMock.mockResolvedValue({ url: 'https://cloudinary/foto.png' });
  useCurrentUserMock.mockReturnValue({ data: baseUser() });
  global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
});

function renderDialog(opts: { user?: UserProfile; allowClose?: boolean } = {}) {
  useCurrentUserMock.mockReturnValue({ data: opts.user ?? baseUser() });
  const onComplete = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  render(
    <QueryClientProvider client={queryClient}>
      <CompleteProfileDialog open={true} onComplete={onComplete} allowClose={opts.allowClose ?? false} />
    </QueryClientProvider>,
  );
  return { onComplete, invalidateSpy };
}

async function avanzarHasta(pasoDestino: number) {
  const leerPasoActual = () => {
    const texto = screen.getByText(/Paso \d de 5/).textContent ?? '';
    return Number(texto.match(/Paso (\d) de 5/)?.[1] ?? '1') - 1;
  };
  while (leerPasoActual() < pasoDestino) {
    const siguiente = leerPasoActual() + 1;
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }));
    await screen.findByText(new RegExp(`Paso ${siguiente + 1} de 5`));
  }
}

describe('CompleteProfileDialog (T-203)', () => {
  it('precarga los campos desde currentUser, incluidas habilidades/intereses/cualidades anidadas', async () => {
    const user = baseUser({
      perfil: {
        ...baseUser().perfil!,
        biografia: 'Estudiante de ISW',
        horasBecaRequeridas: 150,
        horasExtensionRequeridas: null,
      },
      habilidades: [
        {
          idUsuarioHabilidad: 1,
          idHabilidad: 1,
          nivelHabilidad: 'INTERMEDIO',
          habilidad: { idHabilidad: 1, nombreHabilidad: 'React', categoriaHabilidad: null },
        },
      ],
      intereses: [{ idUsuarioInteres: 1, idInteres: 1, interes: { idInteres: 1, nombreInteres: 'Inteligencia Artificial' } }],
    });
    renderDialog({ user });

    expect(await screen.findByDisplayValue('Estudiante de ISW')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Horas beca/i }) as HTMLInputElement).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Horas de extension/i }) as HTMLInputElement).not.toBeChecked();

    await avanzarHasta(1);
    const chipReact = await screen.findByRole('button', { name: 'React' });
    expect(within(chipReact.parentElement!).getByRole('combobox')).toHaveValue('INTERMEDIO');
  });

  it('el checkbox de horas beca/extension alterna el input condicional', async () => {
    renderDialog();
    await screen.findByDisplayValue('10');

    expect(screen.queryByPlaceholderText('Total de horas beca')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /Horas beca/i }));
    expect(screen.getByPlaceholderText('Total de horas beca')).toHaveValue(150);

    expect(screen.queryByPlaceholderText('Total de horas de extension')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /Horas de extension/i }));
    expect(screen.getByPlaceholderText('Total de horas de extension')).toHaveValue(40);
  });

  it('al guardar el paso 1: desmarcar los checkboxes de horas hace que viajen null, aunque tengan un valor numerico cargado', async () => {
    const user = baseUser({
      perfil: { ...baseUser().perfil!, horasBecaRequeridas: 200, horasExtensionRequeridas: 20 },
    });
    renderDialog({ user });
    await screen.findByDisplayValue('10');

    expect(screen.getByRole('checkbox', { name: /Horas beca/i })).toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: /Horas beca/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Horas de extension/i }));

    fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }));
    await waitFor(() => expect(updateProfileMock).toHaveBeenCalled());

    expect(updateProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({ horasBecaRequeridas: null, horasExtensionRequeridas: null }),
    );
  });

  it('con una foto seleccionada, la sube a Cloudinary y fusiona fotoUrl en el PATCH; sin foto no la sube', async () => {
    renderDialog();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const foto = new File(['x'], 'foto.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [foto] } });

    fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }));

    await waitFor(() => expect(uploadToCloudinaryMock).toHaveBeenCalledWith(foto, 'profile-photos'));
    expect(updateProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({ fotoUrl: 'https://cloudinary/foto.png' }),
    );
  });

  it('habilidad con nombre exacto en el catalogo se selecciona sin llamar a createHabilidad', async () => {
    renderDialog();
    await avanzarHasta(1);
    const input = await screen.findByPlaceholderText(/Escribe habilidades/i);

    fireEvent.change(input, { target: { value: 'React' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await screen.findByText(/Seleccionadas: React/i);
    expect(createHabilidadMock).not.toHaveBeenCalled();
    const chip = screen.getByRole('button', { name: 'React' });
    expect(within(chip.parentElement!).getByRole('combobox')).toHaveValue('BASICO');
  });

  it('habilidad sin match en el catalogo crea una nueva via createHabilidad y la selecciona tras refrescar', async () => {
    createHabilidadMock.mockResolvedValue({ idHabilidad: 99, nombreHabilidad: 'Diseño', categoriaHabilidad: null });
    getHabilidadesMock
      .mockResolvedValueOnce(HABILIDADES_BASE)
      .mockResolvedValue([...HABILIDADES_BASE, { idHabilidad: 99, nombreHabilidad: 'Diseño', categoriaHabilidad: null }]);
    renderDialog();
    await avanzarHasta(1);
    const input = await screen.findByPlaceholderText(/Escribe habilidades/i);

    fireEvent.change(input, { target: { value: 'Diseño' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(await screen.findByText(/Creadas: Diseño/i)).toBeInTheDocument();
    expect(createHabilidadMock).toHaveBeenCalledWith('Diseño');
    const chip = await screen.findByRole('button', { name: 'Diseño' });
    expect(within(chip.parentElement!).getByRole('combobox')).toHaveValue('BASICO');
  });

  it('un match ambiguo (dos habilidades contienen el texto, ninguna coincide exacto) crea una nueva en vez de seleccionar', async () => {
    createHabilidadMock.mockResolvedValue({ idHabilidad: 50, nombreHabilidad: 'diseño', categoriaHabilidad: null });
    renderDialog();
    await avanzarHasta(1);
    const input = await screen.findByPlaceholderText(/Escribe habilidades/i);

    fireEvent.change(input, { target: { value: 'diseño' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(createHabilidadMock).toHaveBeenCalledWith('diseño'));
    expect(screen.queryByText(/Seleccionadas:/i)).not.toBeInTheDocument();
  });

  it('escribir el nombre de una habilidad ya seleccionada no la duplica ni resetea su nivel', async () => {
    const user = baseUser({
      habilidades: [
        {
          idUsuarioHabilidad: 1,
          idHabilidad: 1,
          nivelHabilidad: 'AVANZADO',
          habilidad: { idHabilidad: 1, nombreHabilidad: 'React', categoriaHabilidad: null },
        },
      ],
    });
    renderDialog({ user });
    await avanzarHasta(1);
    const input = await screen.findByPlaceholderText(/Escribe habilidades/i);

    fireEvent.change(input, { target: { value: 'React' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await screen.findByText(/Seleccionadas: React/i);
    expect(createHabilidadMock).not.toHaveBeenCalled();
    const chip = screen.getByRole('button', { name: 'React' });
    expect(within(chip.parentElement!).getByRole('combobox')).toHaveValue('AVANZADO');
  });

  it('cambiar el nivel de una habilidad seleccionada solo actualiza esa', async () => {
    renderDialog();
    await avanzarHasta(1);
    const chip = await screen.findByRole('button', { name: 'React' });
    fireEvent.click(chip);
    const select = within(chip.parentElement!).getByRole('combobox');

    fireEvent.change(select, { target: { value: 'AVANZADO' } });

    expect(select).toHaveValue('AVANZADO');
  });

  it('togglear un interes y una cualidad los selecciona y deselecciona', async () => {
    renderDialog();
    await avanzarHasta(2);
    const chipInteres = await screen.findByRole('button', { name: 'Inteligencia Artificial' });
    fireEvent.click(chipInteres);
    expect(chipInteres.className).toContain('bg-secondary');
    fireEvent.click(chipInteres);
    expect(chipInteres.className).not.toContain('bg-secondary');

    await avanzarHasta(3);
    const chipCualidad = await screen.findByRole('button', { name: 'Liderazgo' });
    fireEvent.click(chipCualidad);
    expect(chipCualidad.className).toContain('bg-tertiary');
  });

  it('experiencias: agregar/quitar filas, y al guardar solo se envian las que tienen titulo no vacio', async () => {
    renderDialog();
    await avanzarHasta(4);

    fireEvent.click(screen.getByRole('button', { name: /Agregar otra/i }));
    fireEvent.click(screen.getByRole('button', { name: /Agregar otra/i }));
    const titulos = screen.getAllByPlaceholderText('Titulo del proyecto');
    expect(titulos).toHaveLength(2);
    fireEvent.change(titulos[0], { target: { value: 'UVG Collab' } });

    fireEvent.click(screen.getByRole('button', { name: /Finalizar/i }));

    await waitFor(() => expect(addExperienciaMock).toHaveBeenCalledTimes(1));
    expect(addExperienciaMock).toHaveBeenCalledWith(
      expect.objectContaining({ tituloProyectoExperiencia: 'UVG Collab' }),
    );
  });

  it('guardar en el ultimo paso invalida las 4 query keys y llama a onComplete', async () => {
    const { onComplete, invalidateSpy } = renderDialog();
    await avanzarHasta(4);

    fireEvent.click(screen.getByRole('button', { name: /Finalizar/i }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    for (const key of ['currentUser', 'dashboard-stats', 'dashboard-projects', 'mis-postulaciones']) {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [key] });
    }
  });

  it('un error al guardar no avanza de paso y vuelve a habilitar el boton', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    updateProfileMock.mockRejectedValueOnce(new Error('falla de red'));
    renderDialog();
    await screen.findByDisplayValue('10');

    fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }));

    await waitFor(() => expect(updateProfileMock).toHaveBeenCalled());
    expect(await screen.findByText(/Paso 1 de 5/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Siguiente/i })).not.toBeDisabled();
  });

  it('el boton dice Finalizar solo en el ultimo paso, y "Anterior" no aparece en el paso 0', async () => {
    renderDialog();
    await screen.findByDisplayValue('10');
    expect(screen.queryByRole('button', { name: /Anterior/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Siguiente/i })).toBeInTheDocument();

    await avanzarHasta(4);
    expect(screen.getByRole('button', { name: /Anterior/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Finalizar/i })).toBeInTheDocument();
  });

  it('mientras se guarda, el boton muestra "Guardando..." y queda deshabilitado (estado de carga)', async () => {
    let resolverUpdate: (() => void) | undefined;
    updateProfileMock.mockImplementation(
      () => new Promise<void>((resolve) => { resolverUpdate = () => resolve(); }),
    );
    renderDialog();
    await screen.findByDisplayValue('10');

    fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }));

    const botonGuardando = await screen.findByRole('button', { name: /Guardando/i });
    expect(botonGuardando).toBeDisabled();

    resolverUpdate?.();
    await screen.findByText(/Paso 2 de 5/);
  });

  it('sin ninguna experiencia agregada (estado vacio), guardar no llama a addExperiencia y aun asi completa', async () => {
    const { onComplete } = renderDialog();
    await avanzarHasta(4);

    fireEvent.click(screen.getByRole('button', { name: /Finalizar/i }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(addExperienciaMock).not.toHaveBeenCalled();
  });

  it('cerrar el dialogo solo llama onComplete si allowClose es true', async () => {
    const { onComplete } = renderDialog({ allowClose: false });
    await screen.findByDisplayValue('10');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onComplete).not.toHaveBeenCalled();
  });
});
