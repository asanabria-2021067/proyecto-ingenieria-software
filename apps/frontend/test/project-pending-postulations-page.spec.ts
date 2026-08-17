import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ProyectoDetalleDTO } from '../lib/dto/project.dto';
import type { PostulacionRecibida } from '../types';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '42' }),
}));

vi.mock('../hooks/use-project-detail', () => ({ useProjectDetail: vi.fn() }));
vi.mock('../hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }));
vi.mock('../hooks/use-project-pending-postulations', () => ({
  useProjectPendingPostulations: vi.fn(),
  useResolvePostulacion: vi.fn(),
}));
vi.mock('@/lib/swal', () => ({ default: { fire: vi.fn() } }));

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

import ProjectPendingPostulationsPage from '../app/dashboard/proyectos/[id]/miembros/postulaciones/page';
import { useCurrentUser } from '../hooks/use-current-user';
import { useProjectDetail } from '../hooks/use-project-detail';
import {
  useProjectPendingPostulations,
  useResolvePostulacion,
} from '../hooks/use-project-pending-postulations';

const proyectoFixture = {
  idProyecto: 42,
  creador: { idUsuario: 1, nombre: 'Ana', apellido: 'Lopez', correo: 'ana@uvg.edu.gt' },
} as unknown as ProyectoDetalleDTO;

function postulacion(overrides: Partial<PostulacionRecibida> = {}): PostulacionRecibida {
  return {
    idPostulacion: 1,
    justificacion: 'Quiero aportar experiencia previa trabajando con React y diseño de componentes.',
    estadoPostulacion: 'PENDIENTE',
    fechaPostulacion: '2026-08-15T00:00:00.000Z',
    postulante: { idUsuario: 50, nombre: 'Maria', apellido: 'Lopez', correo: 'maria.lopez@uvg.edu.gt' },
    rolProyecto: { idRolProyecto: 9, nombreRol: 'Desarrollador Frontend React' },
    ...overrides,
  };
}

function mockLeader() {
  (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false });
  (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 1 }, isLoading: false });
}

function mockPendientes(overrides: Partial<ReturnType<typeof useProjectPendingPostulations>> = {}) {
  (useProjectPendingPostulations as any).mockReturnValue({
    postulaciones: [],
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  });
}

function mockResolver(overrides: Record<string, unknown> = {}) {
  const mutate = vi.fn();
  (useResolvePostulacion as any).mockReturnValue({
    mutate,
    isPending: false,
    variables: undefined,
    ...overrides,
  });
  return { mutate };
}

function renderPage() {
  return render(createElement(ProjectPendingPostulationsPage));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ProjectPendingPostulationsPage — F13.1 vista dedicada', () => {
  it('renderiza título, descripción, métricas y listado de postulaciones', () => {
    mockLeader();
    mockResolver();
    mockPendientes({
      postulaciones: [
        postulacion({ idPostulacion: 1, postulante: { idUsuario: 50, nombre: 'Maria', apellido: 'Lopez', correo: 'maria.lopez@uvg.edu.gt' } }),
        postulacion({
          idPostulacion: 2,
          postulante: { idUsuario: 51, nombre: 'Jose', apellido: 'Ramirez', correo: 'jose.ramirez@uvg.edu.gt' },
          rolProyecto: { idRolProyecto: 10, nombreRol: 'Biologo experimentado' },
        }),
        postulacion({
          idPostulacion: 3,
          postulante: { idUsuario: 52, nombre: 'Daniela', apellido: 'Perez', correo: 'daniela.perez@uvg.edu.gt' },
          rolProyecto: { idRolProyecto: 9, nombreRol: 'Desarrollador Frontend React' },
        }),
      ],
    });

    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Postulaciones pendientes' })).toBeInTheDocument();
    expect(
      screen.getByText('Personas que han solicitado unirse a roles de este proyecto y están esperando una resolución.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Postulaciones recibidas')).toBeInTheDocument();
    expect(screen.getByText('3 pendientes')).toBeInTheDocument();
    expect(screen.getByText('Roles con solicitudes')).toBeInTheDocument();
    expect(screen.getByText('Postulantes únicos')).toBeInTheDocument();
    expect(screen.getAllByText('3')).toHaveLength(2);
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Maria Lopez')).toBeInTheDocument();
    expect(screen.getByText('Jose Ramirez')).toBeInTheDocument();
    expect(screen.getByText('Daniela Perez')).toBeInTheDocument();
  });

  it('cada postulación muestra identidad, correo, rol, estado y acciones', () => {
    mockLeader();
    mockResolver();
    mockPendientes({ postulaciones: [postulacion()] });

    renderPage();

    expect(screen.getByText('Maria Lopez')).toBeInTheDocument();
    expect(screen.getByText('maria.lopez@uvg.edu.gt')).toBeInTheDocument();
    expect(screen.getByText('Rol solicitado')).toBeInTheDocument();
    expect(screen.getByText('Desarrollador Frontend React')).toBeInTheDocument();
    expect(screen.getByText('PENDIENTE')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /aceptar postulación de maria lopez/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /rechazar postulación de maria lopez/i })).toBeInTheDocument();
  });

  it('si no hay postulaciones muestra el empty state en la vista dedicada', () => {
    mockLeader();
    mockResolver();
    mockPendientes({ postulaciones: [] });

    renderPage();

    expect(screen.getByText('No hay postulaciones pendientes.')).toBeInTheDocument();
    expect(
      screen.getByText('Cuando alguien solicite unirse a un rol de este proyecto, aparecerá aquí para su revisión.'),
    ).toBeInTheDocument();
  });

  it('el link "Volver a miembros" apunta a la vista de miembros', () => {
    mockLeader();
    mockResolver();
    mockPendientes();

    renderPage();

    expect(screen.getByRole('link', { name: /volver a miembros/i })).toHaveAttribute(
      'href',
      '/dashboard/proyectos/42/miembros',
    );
  });

  it('conecta Aceptar y Rechazar al flujo existente de resolución', async () => {
    mockLeader();
    const { mutate } = mockResolver();
    mockPendientes({ postulaciones: [postulacion()] });

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /aceptar postulación de maria lopez/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, aceptar postulación' }));
    expect(mutate).toHaveBeenCalledWith(
      { postulacionId: 1, estadoPostulacion: 'ACEPTADA' },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );

    fireEvent.click(screen.getByRole('button', { name: /rechazar postulación de maria lopez/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, rechazar postulación' }));
    expect(mutate).toHaveBeenCalledWith(
      { postulacionId: 1, estadoPostulacion: 'RECHAZADA' },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
  });
});
