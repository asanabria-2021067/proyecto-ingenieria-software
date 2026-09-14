import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { UsuarioPerfilDto } from '@/lib/types/social';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '10' }),
}));

const usePerfilUsuarioMock = vi.fn();
const useAccionesAmistadMock = vi.fn();
vi.mock('@/hooks/use-social', () => ({
  usePerfilUsuario: (id: number) => usePerfilUsuarioMock(id),
  useAccionesAmistad: (usuario: unknown) => useAccionesAmistadMock(usuario),
}));

import PerfilPersonaPage from '@/app/dashboard/personas/[id]/page';

function perfil(overrides: Partial<UsuarioPerfilDto> = {}): UsuarioPerfilDto {
  return {
    idUsuario: 10,
    nombre: 'Carla',
    apellido: 'Ruiz',
    fotoUrl: null,
    correo: 'carla@uvg.edu.gt',
    esAmigo: false,
    solicitudPendiente: null,
    loSigo: false,
    carrera: 'Ingeniería',
    semestre: 5,
    mismaCarrera: true,
    amigosEnComun: [],
    habilidades: ['React'],
    intereses: [],
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
