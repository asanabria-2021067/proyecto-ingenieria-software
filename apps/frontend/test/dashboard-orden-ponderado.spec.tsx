import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ProyectoListItemDTO } from '@/lib/dto/project.dto';

// T-252: el motivo del orden ponderado ("2 amigos participan", "De tu
// carrera", o ambos) se arma en el FRONTEND a partir de los campos
// estructurados que manda el backend (`amigosParticipantes`, `mismaCarrera`)
// — nunca a partir de texto ya armado. Un proyecto sin esos campos (usuario
// sin amigos/carrera, o el catálogo de "Destacados") no muestra pastilla.

window.matchMedia =
  window.matchMedia ||
  ((query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList);

vi.mock('@/components/dashboard/DashboardLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/profile/CompleteProfileDialog', () => ({ default: () => null }));
vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({
    data: { idUsuario: 1, nombre: 'Ana', perfil: null, habilidades: [] },
    isLoading: false,
  }),
  isProfileIncomplete: () => false,
}));
vi.mock('@/hooks/use-social', () => ({
  useFeedSocial: () => ({ proyectosDeAmigos: [], proyectosDeSeguidos: [] }),
}));
vi.mock('@/lib/services/users', () => ({
  getDashboardStats: () =>
    Promise.resolve({
      horasBeca: 0,
      horasBecaRequeridas: null,
      horasExtension: 0,
      horasExtensionRequeridas: null,
      horasTotal: 0,
      proyectosActivos: 0,
      postulacionesRecientes: [],
    }),
  getMisTareas: () => Promise.resolve([]),
}));
vi.mock('@/lib/api/client', () => ({ apiFetch: () => Promise.resolve([]) }));

function proyecto(overrides: Partial<ProyectoListItemDTO> = {}): ProyectoListItemDTO {
  return {
    idProyecto: 1,
    tituloProyecto: 'Proyecto',
    descripcionProyecto: 'Descripcion',
    tipoProyecto: 'ACADEMICO_HORAS_BECA',
    estadoProyecto: 'PUBLICADO',
    modalidadProyecto: 'VIRTUAL',
    ...overrides,
  } as ProyectoListItemDTO;
}

let proyectosDisponibles: ProyectoListItemDTO[] = [];
vi.mock('@/lib/services/projects', () => ({
  searchProjects: () => Promise.resolve(proyectosDisponibles),
}));

async function renderDisponibles() {
  const { default: DashboardPage } = await import('@/app/dashboard/page');
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <DashboardPage />
    </QueryClientProvider>,
  );
  const botonDisponibles = await screen.findByRole('button', { name: /Disponibles/ });
  fireEvent.click(botonDisponibles);
}

describe('Dashboard — motivo del orden ponderado (T-252)', () => {
  it('muestra "N amigos participan" cuando hay amigos', async () => {
    proyectosDisponibles = [
      proyecto({ idProyecto: 1, tituloProyecto: 'Con amigos', amigosParticipantes: 2, mismaCarrera: false }),
    ];
    await renderDisponibles();
    expect(await screen.findByText('2 amigos participan')).toBeInTheDocument();
  });

  it('usa singular "1 amigo participa"', async () => {
    proyectosDisponibles = [
      proyecto({ idProyecto: 1, tituloProyecto: 'Un amigo', amigosParticipantes: 1, mismaCarrera: false }),
    ];
    await renderDisponibles();
    expect(await screen.findByText('1 amigo participa')).toBeInTheDocument();
  });

  it('muestra "De tu carrera" cuando solo coincide la carrera', async () => {
    proyectosDisponibles = [
      proyecto({ idProyecto: 1, tituloProyecto: 'Tu carrera', amigosParticipantes: 0, mismaCarrera: true }),
    ];
    await renderDisponibles();
    expect(await screen.findByText('De tu carrera')).toBeInTheDocument();
  });

  it('combina ambos motivos cuando aplican los dos', async () => {
    proyectosDisponibles = [
      proyecto({ idProyecto: 1, tituloProyecto: 'Ambos', amigosParticipantes: 3, mismaCarrera: true }),
    ];
    await renderDisponibles();
    expect(await screen.findByText('3 amigos participan · De tu carrera')).toBeInTheDocument();
  });

  it('sin amigos ni carrera coincidente no muestra pastilla de motivo (solo tipo/estado)', async () => {
    proyectosDisponibles = [proyecto({ idProyecto: 1, tituloProyecto: 'Sin motivo' })];
    await renderDisponibles();
    await screen.findByText('Sin motivo');
    expect(screen.queryByText(/amigo/)).not.toBeInTheDocument();
    expect(screen.queryByText('De tu carrera')).not.toBeInTheDocument();
  });
});
