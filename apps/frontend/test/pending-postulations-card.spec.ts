import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { PostulacionRecibida } from '../types';

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/swal', () => ({ default: { fire: vi.fn() } }));

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

import { PendingPostulationsCard } from '../components/projects/pending-postulations-card';
import { apiFetch } from '@/lib/api/client';
import uvgSwal from '@/lib/swal';

const PENDIENTES_URL = '/proyectos/42/miembros/postulaciones-pendientes';

function postulacion(overrides: Partial<PostulacionRecibida> = {}): PostulacionRecibida {
  return {
    idPostulacion: 1,
    justificacion: 'Quiero contribuir con el backend del proyecto.',
    estadoPostulacion: 'PENDIENTE',
    fechaPostulacion: '2026-01-05T00:00:00.000Z',
    postulante: { idUsuario: 50, nombre: 'Diego', apellido: 'Solís', correo: 'diego@uvg.edu.gt' },
    rolProyecto: { idRolProyecto: 9, nombreRol: 'Backend' },
    ...overrides,
  };
}

function renderCard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return render(createElement(PendingPostulationsCard, { idProyecto: 42 }), { wrapper });
}

function mockGetPendientes(postulaciones: PostulacionRecibida[] | Error) {
  (apiFetch as any).mockImplementation((path: string, options?: RequestInit) => {
    if (path === PENDIENTES_URL && (!options || !options.method)) {
      return postulaciones instanceof Error ? Promise.reject(postulaciones) : Promise.resolve(postulaciones);
    }
    return Promise.reject(new Error(`ruta no mockeada: ${path}`));
  });
}

function abrirTarjeta() {
  fireEvent.click(screen.getByRole('button', { name: /Postulaciones pendientes/i }));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PendingPostulationsCard — contador', () => {
  it('con ninguna postulación pendiente muestra "0"', async () => {
    mockGetPendientes([]);
    renderCard();

    await waitFor(() => expect(screen.getByText('Postulaciones pendientes')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('0')).toBeInTheDocument());
  });

  it('con tres postulaciones pendientes muestra "3"', async () => {
    mockGetPendientes([postulacion({ idPostulacion: 1 }), postulacion({ idPostulacion: 2 }), postulacion({ idPostulacion: 3 })]);
    renderCard();

    await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument());
  });
});

describe('PendingPostulationsCard — listado', () => {
  it('al abrir la tarjeta muestra exactamente las postulaciones recibidas de B13', async () => {
    mockGetPendientes([
      postulacion({ idPostulacion: 1, postulante: { idUsuario: 50, nombre: 'Diego', apellido: 'Solís', correo: 'd@uvg.edu.gt' } }),
      postulacion({ idPostulacion: 2, postulante: { idUsuario: 51, nombre: 'Marta', apellido: 'Ríos', correo: 'm@uvg.edu.gt' } }),
    ]);
    renderCard();

    await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument());
    abrirTarjeta();

    expect(screen.getByText('Diego Solís')).toBeInTheDocument();
    expect(screen.getByText('Marta Ríos')).toBeInTheDocument();
    expect(screen.queryByText('Ana Otra')).not.toBeInTheDocument();
  });

  it('con [] muestra el estado vacío del listado, no un listado en blanco', async () => {
    mockGetPendientes([]);
    renderCard();

    await waitFor(() => expect(screen.getByText('0')).toBeInTheDocument());
    abrirTarjeta();

    expect(screen.getByText('No hay postulaciones pendientes.')).toBeInTheDocument();
  });
});

describe('PendingPostulationsCard — loading local', () => {
  it('muestra un esqueleto mientras carga, no un contador falso', () => {
    (apiFetch as any).mockReturnValue(new Promise(() => {}));
    const { container } = renderCard();

    expect(screen.getByText('Postulaciones pendientes')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });
});

describe('PendingPostulationsCard — error local', () => {
  it('un error en B13 no muestra "0": expone el error con opción de reintentar', async () => {
    mockGetPendientes(new Error('fallo de red'));
    renderCard();

    await waitFor(() => expect(screen.getByText('Error')).toBeInTheDocument());
    expect(screen.queryByText('0')).not.toBeInTheDocument();

    abrirTarjeta();
    expect(screen.getByText('No fue posible cargar las postulaciones.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});

describe('PendingPostulationsCard — Aceptar', () => {
  function mockPatchAceptar() {
    (apiFetch as any).mockImplementation((path: string, options?: RequestInit) => {
      if (path === PENDIENTES_URL && (!options || !options.method)) {
        return Promise.resolve([postulacion({ idPostulacion: 1 })]);
      }
      if (path === '/postulaciones/1/estado' && options?.method === 'PATCH') {
        return Promise.resolve({ idPostulacion: 1, estadoPostulacion: 'ACEPTADA' });
      }
      return Promise.reject(new Error(`ruta no mockeada: ${path}`));
    });
  }

  it('llama exactamente PATCH /postulaciones/:id/estado con estadoPostulacion=ACEPTADA, una sola vez', async () => {
    mockPatchAceptar();
    renderCard();

    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());
    abrirTarjeta();

    fireEvent.click(screen.getByRole('button', { name: /Aceptar postulación de Diego Solís/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, aceptar postulación' }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith('/postulaciones/1/estado', {
        method: 'PATCH',
        body: JSON.stringify({ estadoPostulacion: 'ACEPTADA', comentarioResolucion: undefined }),
      }),
    );
    const llamadasPatch = (apiFetch as any).mock.calls.filter(([path]: [string]) => path === '/postulaciones/1/estado');
    expect(llamadasPatch).toHaveLength(1);
  });

  it('tras éxito, la postulación deja de aparecer y el contador baja (reconcilia con el servidor, no con setState local)', async () => {
    let pendientesActuales = [postulacion({ idPostulacion: 1 })];
    (apiFetch as any).mockImplementation((path: string, options?: RequestInit) => {
      if (path === PENDIENTES_URL && (!options || !options.method)) {
        return Promise.resolve(pendientesActuales);
      }
      if (path === '/postulaciones/1/estado' && options?.method === 'PATCH') {
        pendientesActuales = [];
        return Promise.resolve({ idPostulacion: 1, estadoPostulacion: 'ACEPTADA' });
      }
      return Promise.reject(new Error(`ruta no mockeada: ${path}`));
    });
    renderCard();

    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());
    abrirTarjeta();
    fireEvent.click(screen.getByRole('button', { name: /Aceptar postulación de Diego Solís/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, aceptar postulación' }));

    await waitFor(() => expect(screen.getByText('0')).toBeInTheDocument());
    expect(screen.queryByText('Diego Solís')).not.toBeInTheDocument();
  });

  it('evita doble submit: el botón de confirmación se deshabilita mientras la mutation está pendiente', async () => {
    let resolverPatch!: (value: unknown) => void;
    (apiFetch as any).mockImplementation((path: string, options?: RequestInit) => {
      if (path === PENDIENTES_URL && (!options || !options.method)) {
        return Promise.resolve([postulacion({ idPostulacion: 1 })]);
      }
      if (path === '/postulaciones/1/estado' && options?.method === 'PATCH') {
        return new Promise((resolve) => {
          resolverPatch = resolve;
        });
      }
      return Promise.reject(new Error(`ruta no mockeada: ${path}`));
    });
    renderCard();

    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());
    abrirTarjeta();
    fireEvent.click(screen.getByRole('button', { name: /Aceptar postulación de Diego Solís/i }));
    const confirmar = await screen.findByRole('button', { name: 'Sí, aceptar postulación' });
    fireEvent.click(confirmar);

    await waitFor(() => expect(confirmar).toBeDisabled());
    fireEvent.click(confirmar);

    const llamadasPatch = (apiFetch as any).mock.calls.filter(([path]: [string]) => path === '/postulaciones/1/estado');
    expect(llamadasPatch).toHaveLength(1);

    resolverPatch({ idPostulacion: 1, estadoPostulacion: 'ACEPTADA' });
  });

  it('un error muestra el mensaje real y no elimina la postulación de la lista', async () => {
    (apiFetch as any).mockImplementation((path: string, options?: RequestInit) => {
      if (path === PENDIENTES_URL && (!options || !options.method)) {
        return Promise.resolve([postulacion({ idPostulacion: 1 })]);
      }
      if (path === '/postulaciones/1/estado' && options?.method === 'PATCH') {
        return Promise.reject(new Error('Esta postulación ya fue resuelta'));
      }
      return Promise.reject(new Error(`ruta no mockeada: ${path}`));
    });
    renderCard();

    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());
    abrirTarjeta();
    fireEvent.click(screen.getByRole('button', { name: /Aceptar postulación de Diego Solís/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, aceptar postulación' }));

    await waitFor(() =>
      expect(uvgSwal.fire).toHaveBeenCalledWith(
        expect.objectContaining({ icon: 'error', text: 'Esta postulación ya fue resuelta' }),
      ),
    );
    expect(screen.getByText('Diego Solís')).toBeInTheDocument();
  });
});

describe('PendingPostulationsCard — Rechazar', () => {
  it('llama exactamente PATCH /postulaciones/:id/estado con estadoPostulacion=RECHAZADA', async () => {
    (apiFetch as any).mockImplementation((path: string, options?: RequestInit) => {
      if (path === PENDIENTES_URL && (!options || !options.method)) {
        return Promise.resolve([postulacion({ idPostulacion: 1 })]);
      }
      if (path === '/postulaciones/1/estado' && options?.method === 'PATCH') {
        return Promise.resolve({ idPostulacion: 1, estadoPostulacion: 'RECHAZADA' });
      }
      return Promise.reject(new Error(`ruta no mockeada: ${path}`));
    });
    renderCard();

    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());
    abrirTarjeta();
    fireEvent.click(screen.getByRole('button', { name: /Rechazar postulación de Diego Solís/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, rechazar postulación' }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith('/postulaciones/1/estado', {
        method: 'PATCH',
        body: JSON.stringify({ estadoPostulacion: 'RECHAZADA', comentarioResolucion: undefined }),
      }),
    );
  });

  it('tras éxito, la postulación rechazada desaparece de pendientes y el contador baja', async () => {
    let pendientesActuales = [postulacion({ idPostulacion: 1 })];
    (apiFetch as any).mockImplementation((path: string, options?: RequestInit) => {
      if (path === PENDIENTES_URL && (!options || !options.method)) {
        return Promise.resolve(pendientesActuales);
      }
      if (path === '/postulaciones/1/estado' && options?.method === 'PATCH') {
        pendientesActuales = [];
        return Promise.resolve({ idPostulacion: 1, estadoPostulacion: 'RECHAZADA' });
      }
      return Promise.reject(new Error(`ruta no mockeada: ${path}`));
    });
    renderCard();

    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());
    abrirTarjeta();
    fireEvent.click(screen.getByRole('button', { name: /Rechazar postulación de Diego Solís/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, rechazar postulación' }));

    await waitFor(() => expect(screen.getByText('0')).toBeInTheDocument());
  });

  it('cancelar el diálogo de confirmación no llama al endpoint', async () => {
    mockGetPendientes([postulacion({ idPostulacion: 1 })]);
    renderCard();

    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());
    abrirTarjeta();
    fireEvent.click(screen.getByRole('button', { name: /Rechazar postulación de Diego Solís/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));

    const llamadasPatch = (apiFetch as any).mock.calls.filter(([path]: [string]) => path === '/postulaciones/1/estado');
    expect(llamadasPatch).toHaveLength(0);
  });
});

describe('PendingPostulationsCard — accesibilidad', () => {
  it('la tarjeta es un botón semántico con aria-expanded y nombre accesible con el concepto', async () => {
    mockGetPendientes([]);
    renderCard();

    await waitFor(() => expect(screen.getByText('0')).toBeInTheDocument());
    const boton = screen.getByRole('button', { name: /Postulaciones pendientes/i });
    expect(boton).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(boton);
    expect(boton).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('PendingPostulationsCard — fuera de alcance (F13 no anticipa F14)', () => {
  it('no muestra acciones de resolución de salida', async () => {
    mockGetPendientes([postulacion({ idPostulacion: 1 })]);
    renderCard();

    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());
    abrirTarjeta();

    expect(screen.queryByText(/Aprobar salida/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Rechazar salida/i)).not.toBeInTheDocument();
  });
});
