import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { OrganizacionDetalle, RolOrganizacion } from '@/lib/types/organizations';

const estado = vi.hoisted(() => {
  const mutate = vi.fn();
  return { org: null as unknown, mutate, push: vi.fn(), mutacion: () => ({ mutate, isPending: false }) };
});

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '7' }),
  useRouter: () => ({ push: estado.push, replace: vi.fn() }),
}));
vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: { idUsuario: 1, nombre: 'Ana', apellido: 'Paz', roles: [] } }),
}));
vi.mock('@/lib/mensajes', () => ({
  aviso: { exito: vi.fn(), error: vi.fn(), advertencia: vi.fn() },
  confirmar: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/hooks/use-organizations', () => ({
  useOrganizacion: () => ({ data: estado.org, isLoading: false, isError: false }),
  useSalirDeOrganizacion: estado.mutacion,
  useArchivarOrganizacion: estado.mutacion,
  useSolicitarUnirse: estado.mutacion,
  useCambiarRolMiembro: estado.mutacion,
  useQuitarMiembro: estado.mutacion,
  useInvitarMiembro: estado.mutacion,
  useTransferirOrganizacion: estado.mutacion,
  useCandidatosOrg: () => ({ data: [], isFetching: false }),
  useSolicitudesOrg: () => ({ data: [] }),
  useInvitacionesOrg: () => ({ data: [] }),
  useResolverSolicitud: estado.mutacion,
  useCancelarInvitacion: estado.mutacion,
  useCanalOrganizacion: () => ({ data: undefined, isLoading: true, isError: false }),
  useMensajesOrganizacion: () => ({ data: [] }),
  useEnviarMensajeOrganizacion: estado.mutacion,
}));

import OrganizacionPage from '@/app/dashboard/organizaciones/[id]/page';

const usuario = (idUsuario: number, nombre: string) => ({ idUsuario, nombre, apellido: 'X', fotoUrl: null });

function orgCon(miRol: RolOrganizacion | null, extra: Partial<OrganizacionDetalle> = {}): OrganizacionDetalle {
  return {
    idOrganizacion: 7,
    nombreOrganizacion: 'Grupo Robotica',
    descripcionOrganizacion: 'Robots',
    sitioWeb: 'https://robotica.test',
    logoUrl: null,
    visibilidad: 'PUBLICA',
    fechaCreacion: '2026-01-01T00:00:00.000Z',
    archivada: false,
    miRol,
    puedePublicar: miRol === 'PROPIETARIO' || miRol === 'ADMINISTRADOR' || miRol === 'EDITOR',
    totalMiembros: 2,
    miembros: miRol
      ? [
          { ...usuario(1, 'Ana'), rolOrganizacion: miRol, fechaIngreso: '2026-01-02T00:00:00.000Z' },
          { ...usuario(2, 'Beto'), rolOrganizacion: 'LECTURA', fechaIngreso: '2026-01-03T00:00:00.000Z' },
        ]
      : null,
    proyectos: [
      {
        idProyecto: 11,
        tituloProyecto: 'Brazo robotico',
        tipoProyecto: 'ACADEMICO_HORAS_BECA',
        estadoProyecto: 'EN_PROGRESO',
        fechaPublicacion: null,
        creador: usuario(1, 'Ana'),
        publicadoPor: 'Grupo Robotica',
        avance: { total: 4, hecho: 1, porcentaje: 25 },
      },
      {
        idProyecto: 12,
        tituloProyecto: 'Rover',
        tipoProyecto: 'ACADEMICO_EXPERIENCIA',
        estadoProyecto: 'CERRADO',
        fechaPublicacion: null,
        creador: usuario(1, 'Ana'),
        publicadoPor: 'Grupo Robotica',
        avance: { total: 2, hecho: 2, porcentaje: 100 },
      },
    ],
    invitacionesPendientes: miRol === 'PROPIETARIO' || miRol === 'ADMINISTRADOR' ? 1 : null,
    solicitudesPendientes: miRol === 'PROPIETARIO' || miRol === 'ADMINISTRADOR' ? 2 : null,
    solicitudPendiente: false,
    ...extra,
  };
}

const boton = (nombre: string | RegExp) => screen.queryByRole('button', { name: nombre });

describe('pagina de la organizacion', () => {
  beforeEach(() => estado.mutate.mockReset());
  afterEach(() => cleanup());

  it('el Propietario gestiona: invita, transfiere y archiva, pero no sale', () => {
    estado.org = orgCon('PROPIETARIO');
    render(<OrganizacionPage />);

    expect(boton('Invitar')).toBeInTheDocument();
    expect(boton('Transferir propiedad')).toBeInTheDocument();
    expect(boton('Archivar')).toBeInTheDocument();
    expect(boton('Salir')).toBeNull();
    expect(screen.getByRole('tab', { name: 'Solicitudes e invitaciones (3)' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Nuevo proyecto/ })).toHaveAttribute(
      'href',
      '/dashboard/projects/mine/form?org=7',
    );
  });

  it('el Administrador invita y sale, pero no transfiere ni archiva', () => {
    estado.org = orgCon('ADMINISTRADOR');
    render(<OrganizacionPage />);

    expect(boton('Invitar')).toBeInTheDocument();
    expect(boton('Salir')).toBeInTheDocument();
    expect(boton('Transferir propiedad')).toBeNull();
    expect(boton('Archivar')).toBeNull();
  });

  it('el Editor publica proyectos pero no gestiona miembros', () => {
    estado.org = orgCon('EDITOR');
    render(<OrganizacionPage />);

    expect(screen.getByRole('link', { name: /Nuevo proyecto/ })).toBeInTheDocument();
    expect(boton('Invitar')).toBeNull();
    expect(screen.queryByRole('tab', { name: /Solicitudes e invitaciones/ })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Chat' })).toBeInTheDocument();
  });

  it('Lectura ve miembros y chat sin acciones de edicion; puede salir', () => {
    estado.org = orgCon('LECTURA');
    render(<OrganizacionPage />);

    expect(screen.queryByRole('link', { name: /Nuevo proyecto/ })).toBeNull();
    expect(boton('Invitar')).toBeNull();
    expect(boton('Salir')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Miembros/ })).toBeInTheDocument();
  });

  it('un visitante de una organizacion publica solo ve proyectos y puede solicitar unirse', () => {
    estado.org = orgCon(null);
    render(<OrganizacionPage />);

    expect(screen.queryByRole('tab', { name: /Miembros/ })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Chat' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar unirse' }));
    expect(estado.mutate).toHaveBeenCalledWith(7, expect.any(Object));
  });

  it('con solicitud pendiente muestra el estado en vez del boton', () => {
    estado.org = orgCon(null, { solicitudPendiente: true });
    render(<OrganizacionPage />);

    expect(boton('Solicitar unirse')).toBeNull();
    expect(screen.getByText('Solicitud enviada')).toBeInTheDocument();
  });

  it('separa proyectos activos y cerrados con su avance', () => {
    estado.org = orgCon('LECTURA');
    render(<OrganizacionPage />);

    const activos = screen.getByRole('region', { name: 'Proyectos activos' });
    const cerrados = screen.getByRole('region', { name: 'Proyectos cerrados' });
    expect(within(activos).getByText('Brazo robotico')).toBeInTheDocument();
    expect(within(activos).getByText('25% (1/4 tareas)')).toBeInTheDocument();
    expect(within(cerrados).getByText('Rover')).toBeInTheDocument();
    expect(within(cerrados).getByText('100% (2/2 tareas)')).toBeInTheDocument();
  });

  it('archivada: avisa solo lectura y oculta acciones que cambian la organizacion', () => {
    estado.org = orgCon('PROPIETARIO', { archivada: true });
    render(<OrganizacionPage />);

    expect(screen.getByText('Organización archivada.')).toBeInTheDocument();
    expect(boton('Invitar')).toBeNull();
    expect(boton('Archivar')).toBeNull();
    expect(boton('Transferir propiedad')).toBeNull();
  });

  it('salir confirma y llama al servicio', async () => {
    estado.org = orgCon('EDITOR');
    render(<OrganizacionPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Salir' }));
    await vi.waitFor(() => expect(estado.mutate).toHaveBeenCalled());
  });
});
