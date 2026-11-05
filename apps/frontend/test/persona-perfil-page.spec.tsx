import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { UsuarioPerfilDto } from '@/lib/types/social';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '10' }),
}));

// MEJ-22: el diálogo de invitar a un rol usa TanStack Query; aquí solo importa el perfil.
vi.mock('@/components/projects/invitar-a-rol-dialog', () => ({ InvitarARolDialog: () => null }));

// MEJ-132: el estado de la persona usa TanStack Query y tiene su propio spec.
vi.mock('@/components/chat-dock/estado-chat', () => ({ EstadoPerfilAjeno: () => null }));

const usePerfilUsuarioMock = vi.fn();
const useAccionesAmistadMock = vi.fn();
vi.mock('@/hooks/use-social', () => ({
  usePerfilUsuario: (id: number) => usePerfilUsuarioMock(id),
  useAccionesAmistad: (usuario: unknown) => useAccionesAmistadMock(usuario),
}));

// MEJ-26/28/64: las secciones nuevas tienen su propio spec; aquí solo importa que el perfil no dependa de ellas.
const enviarMensajeMock = vi.fn();
const resumen = (puedeMensaje: boolean) => ({
  data: { organizaciones: [], asociaciones: [], puedeMensaje, horasSemestre: { anio: 2026, periodo: 1, becaAcreditadas: 0, extensionAcreditadas: 0 } },
  isLoading: false,
  isError: false,
});
const usePerfilResumenMock = vi.fn((): { data?: ReturnType<typeof resumen>["data"]; isLoading: boolean; isError: boolean } => ({ data: undefined, isLoading: false, isError: false }));
vi.mock('@/hooks/use-perfil-social', () => ({
  useEnviarMensaje: () => ({ mutate: enviarMensajeMock, isPending: false }),
  usePerfilResumen: () => usePerfilResumenMock(),
  useActividadReciente: () => ({ data: undefined, isLoading: false, isError: false }),
}));

import PerfilPersonaPage from '@/app/dashboard/personas/[id]/page';

function perfil(overrides: Partial<UsuarioPerfilDto> = {}): UsuarioPerfilDto {
  return {
    idUsuario: 10,
    nombre: 'Carla',
    apellido: 'Ruiz',
    fotoUrl: null,
    esAmigo: false,
    solicitudPendiente: null,
    idAmistad: null,
    loSigo: false,
    carrera: 'Ingeniería',
    semestre: 5,
    mismaCarrera: true,
    amigosEnComun: [],
    habilidades: ['React'],
    intereses: [],
    insignias: [],
    proyectosActivos: [],
    ...overrides,
  };
}

const accionesDefault = {
  amistad: { label: 'Agregar como amigo', variant: 'default' as const, disabled: false, onClick: vi.fn() },
  seguimiento: { label: 'Seguir', disabled: false, onClick: vi.fn() },
};

describe('PerfilPersonaPage', () => {
  it('muestra estado de carga sin reventar', () => {
    usePerfilUsuarioMock.mockReturnValue({ perfil: null, isLoading: true, isError: false });
    useAccionesAmistadMock.mockReturnValue(accionesDefault);

    render(<PerfilPersonaPage />);

    expect(screen.queryByText('Carla Ruiz')).not.toBeInTheDocument();
  });

  it('muestra estado de error con link de volver', () => {
    usePerfilUsuarioMock.mockReturnValue({ perfil: null, isLoading: false, isError: true });
    useAccionesAmistadMock.mockReturnValue(accionesDefault);

    render(<PerfilPersonaPage />);

    expect(screen.getByText('No pudimos cargar este perfil')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Volver a Personas/i })).toHaveAttribute(
      'href',
      '/dashboard/personas',
    );
  });

  it('muestra las insignias obtenidas del perfil público (HU-190)', () => {
    const sinFechas = { BRONCE: null, PLATA: null, ORO: null, DIAMANTE: null };
    usePerfilUsuarioMock.mockReturnValue({
      perfil: perfil({
        insignias: [
          {
            clave: 'horas',
            nombre: 'Horas acreditadas',
            descripcion: 'd',
            icono: 'Clock',
            nivel: 'ORO',
            progreso: 120,
            umbrales: [5, 25, 100, 250],
            siguienteUmbral: 250,
            fechas: sinFechas,
          },
        ],
      }),
      isLoading: false,
      isError: false,
    });
    useAccionesAmistadMock.mockReturnValue(accionesDefault);

    render(<PerfilPersonaPage />);

    expect(screen.getByRole('heading', { name: 'Insignias' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Horas acreditadas, nivel Oro' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Bloqueadas' })).not.toBeInTheDocument();
  });

  it('renderiza nombre, carrera, semestre, habilidades y motivo de afinidad', () => {
    usePerfilUsuarioMock.mockReturnValue({ perfil: perfil(), isLoading: false, isError: false });
    useAccionesAmistadMock.mockReturnValue(accionesDefault);

    render(<PerfilPersonaPage />);

    expect(screen.getByText('Carla Ruiz')).toBeInTheDocument();
    expect(screen.getAllByText('Ingeniería').length).toBeGreaterThan(0);
    expect(screen.getByText('Semestre 5')).toBeInTheDocument();
    expect(screen.getByText('De tu carrera')).toBeInTheDocument();
    expect(screen.getByText('React')).toBeInTheDocument();
  });

  it('«Enviar mensaje» aparece solo entre amigos y abre la conversación (MEJ-28)', () => {
    usePerfilUsuarioMock.mockReturnValue({ perfil: perfil(), isLoading: false, isError: false });
    useAccionesAmistadMock.mockReturnValue(accionesDefault);
    const { unmount } = render(<PerfilPersonaPage />);
    expect(screen.queryByRole('button', { name: /Enviar mensaje/ })).not.toBeInTheDocument();
    unmount();

    usePerfilUsuarioMock.mockReturnValue({ perfil: perfil({ esAmigo: true }), isLoading: false, isError: false });
    // Amigos sin conversación ni proyecto compartido: no se ofrece un botón que fallaría.
    usePerfilResumenMock.mockReturnValue(resumen(false));
    const sinProyecto = render(<PerfilPersonaPage />);
    expect(screen.queryByRole('button', { name: /Enviar mensaje/ })).not.toBeInTheDocument();
    sinProyecto.unmount();

    usePerfilResumenMock.mockReturnValue(resumen(true));
    render(<PerfilPersonaPage />);
    fireEvent.click(screen.getByRole('button', { name: /Enviar mensaje/ }));
    expect(enviarMensajeMock).toHaveBeenCalledTimes(1);
    usePerfilResumenMock.mockReset();
    expect(screen.getByRole('link', { name: /Ver currículum de proyectos/ })).toHaveAttribute('href', '/dashboard/personas/10/cv');
  });

  it('con amigos en común muestra el conteo y la lista en vez de "De tu carrera"', () => {
    usePerfilUsuarioMock.mockReturnValue({
      perfil: perfil({ amigosEnComun: [{ idUsuario: 3, nombre: 'Beto', apellido: 'Gómez', fotoUrl: null }] }),
      isLoading: false,
      isError: false,
    });
    useAccionesAmistadMock.mockReturnValue(accionesDefault);

    render(<PerfilPersonaPage />);

    expect(screen.getByText('1 amigo en común')).toBeInTheDocument();
    expect(screen.getByText('Beto Gómez')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Beto Gómez/i })).toHaveAttribute(
      'href',
      '/dashboard/personas/3',
    );
  });

  it('sin amigos en común muestra el estado vacío', () => {
    usePerfilUsuarioMock.mockReturnValue({ perfil: perfil(), isLoading: false, isError: false });
    useAccionesAmistadMock.mockReturnValue(accionesDefault);

    render(<PerfilPersonaPage />);

    expect(screen.getByText('Todavía no tienen amigos en común.')).toBeInTheDocument();
  });

  it('lista proyectos activos con link al proyecto', () => {
    usePerfilUsuarioMock.mockReturnValue({
      perfil: perfil({
        proyectosActivos: [
          { idProyecto: 99, tituloProyecto: 'Portal UVG', estadoProyecto: 'EN_PROGRESO', rolNombre: 'Frontend' },
        ],
      }),
      isLoading: false,
      isError: false,
    });
    useAccionesAmistadMock.mockReturnValue(accionesDefault);

    render(<PerfilPersonaPage />);

    expect(screen.getByText('Portal UVG')).toBeInTheDocument();
    expect(screen.getByText('Frontend')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Portal UVG/i })).toHaveAttribute(
      'href',
      '/dashboard/proyectos/99',
    );
  });

  it('usa las acciones de amistad/seguimiento del hook compartido', () => {
    const onClickAmistad = vi.fn();
    usePerfilUsuarioMock.mockReturnValue({ perfil: perfil(), isLoading: false, isError: false });
    useAccionesAmistadMock.mockReturnValue({
      amistad: { label: 'Agregar como amigo', variant: 'default' as const, disabled: false, onClick: onClickAmistad },
      seguimiento: { label: 'Seguir', disabled: false, onClick: vi.fn() },
    });

    render(<PerfilPersonaPage />);
    screen.getByRole('button', { name: 'Agregar como amigo' }).click();

    expect(onClickAmistad).toHaveBeenCalled();
  });
});
