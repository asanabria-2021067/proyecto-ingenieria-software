import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { PostulacionRecibida } from '../types';

vi.mock('../hooks/use-project-pending-postulations', () => ({
  useProjectPendingPostulations: vi.fn(),
}));

import { PendingPostulationsCard } from '../components/projects/pending-postulations-card';
import { useProjectPendingPostulations } from '../hooks/use-project-pending-postulations';

function postulacion(overrides: Partial<PostulacionRecibida> = {}): PostulacionRecibida {
  return {
    idPostulacion: 1,
    justificacion: 'Quiero contribuir con el backend del proyecto.',
    estadoPostulacion: 'PENDIENTE',
    fechaPostulacion: '2026-01-05T00:00:00.000Z',
    postulante: { idUsuario: 50, nombre: 'Diego', apellido: 'Solis', correo: 'diego@uvg.edu.gt' },
    rolProyecto: { idRolProyecto: 9, nombreRol: 'Backend' },
    ...overrides,
  };
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

function renderCard() {
  return render(createElement(PendingPostulationsCard, { idProyecto: 42 }));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PendingPostulationsCard — F13.1 entry point', () => {
  it('muestra el contador de postulaciones pendientes', () => {
    mockPendientes({
      postulaciones: [
        postulacion({ idPostulacion: 1 }),
        postulacion({ idPostulacion: 2 }),
        postulacion({ idPostulacion: 3 }),
      ],
    });

    renderCard();

    expect(screen.getByText('Postulaciones pendientes')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('navega a la vista dedicada de postulaciones pendientes', () => {
    mockPendientes();

    renderCard();

    expect(screen.getByRole('link', { name: /ver postulaciones pendientes/i })).toHaveAttribute(
      'href',
      '/dashboard/proyectos/42/miembros/postulaciones',
    );
  });

  it('no comunica expansión ni renderiza el listado inline', () => {
    mockPendientes({ postulaciones: [postulacion()] });

    renderCard();

    expect(screen.queryByRole('button', { name: /postulaciones pendientes/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Diego Solis')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /aceptar postulación/i })).not.toBeInTheDocument();
  });
});
