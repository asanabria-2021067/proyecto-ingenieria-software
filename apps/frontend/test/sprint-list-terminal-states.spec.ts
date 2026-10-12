import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ProyectoDetalleDTO } from '../lib/dto/project.dto';

vi.mock('next/navigation', () => ({ useParams: () => ({ id: '42' }) }));
vi.mock('../hooks/use-project-detail', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../hooks/use-project-detail')>()),
  useProjectDetail: vi.fn(),
}));
vi.mock('../hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }));
vi.mock('../hooks/use-project-sprints', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../hooks/use-project-sprints')>()),
  useProjectSprints: vi.fn(),
  useFinalizeSprint: vi.fn(),
}));
vi.mock('../lib/services/sprints', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/services/sprints')>()),
  getProjectSprints: vi.fn(),
}));
vi.mock('../lib/swal', () => ({ default: { fire: vi.fn() } }));

import SprintListPage from '../app/dashboard/proyectos/[id]/sprints/page';
import { useProjectDetail } from '../hooks/use-project-detail';
import { useCurrentUser } from '../hooks/use-current-user';
import { useFinalizeSprint, useProjectSprints } from '../hooks/use-project-sprints';
import { getProjectSprints } from '../lib/services/sprints';
import { reintentarSiNoEsTerminal } from '../lib/api/query-retry';

/**
 * GPI01-C05 (H-03). La URL directa de Sprints nunca se queda cargando ni dice
 * «no eres líder» cuando en realidad el proyecto no existe o no cargó: cada
 * respuesta terminal tiene su estado, con una salida. Los errores terminales
 * (401/403/404) no se reintentan; los transitorios ofrecen un reintento manual.
 */

const httpError = (statusCode: number) => Object.assign(new Error(`HTTP ${statusCode}`), { statusCode });

const proyecto = (estadoProyecto: string) =>
  ({ idProyecto: 42, estadoProyecto, creador: { idUsuario: 1 } }) as unknown as ProyectoDetalleDTO;

function escenario({
  proyectoData,
  proyectoError,
  cargandoProyecto = false,
  sprints = {},
  userId = 1,
}: {
  proyectoData?: ProyectoDetalleDTO;
  proyectoError?: Error;
  cargandoProyecto?: boolean;
  sprints?: Record<string, unknown>;
  userId?: number;
}) {
  const refetchProyecto = vi.fn();
  const refetchSprints = vi.fn();
  (useProjectDetail as any).mockReturnValue({
    data: proyectoData,
    isLoading: cargandoProyecto,
    isError: Boolean(proyectoError),
    error: proyectoError ?? null,
    refetch: refetchProyecto,
  });
  (useCurrentUser as any).mockReturnValue({ data: { idUsuario: userId }, isLoading: false });
  (useProjectSprints as any).mockReturnValue({
    sprints: [],
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: refetchSprints,
    ...sprints,
  });
  (useFinalizeSprint as any).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false, error: null });
  render(createElement(SprintListPage));
  return { refetchProyecto, refetchSprints };
}

const sinSkeleton = () => expect(document.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(0);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('GPI01-C05: estados terminales de la lectura del proyecto', () => {
  it('404: «Proyecto no encontrado» con enlace de vuelta, nunca «no eres líder»', () => {
    escenario({ proyectoError: httpError(404), sprints: { isError: true, error: httpError(404) } });

    expect(screen.getByText('Proyecto no encontrado')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a proyectos' })).toHaveAttribute('href', '/dashboard/proyectos');
    expect(screen.queryByText(/no eres líder/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    sinSkeleton();
  });

  it('403: sin acceso al proyecto, sin lista ni reintento', () => {
    escenario({ proyectoError: httpError(403), sprints: { isError: true, error: httpError(403) }, userId: 999 });

    expect(screen.getByText('No tienes acceso a este proyecto.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a proyectos' })).toHaveAttribute('href', '/dashboard/proyectos');
    expect(screen.queryByRole('heading', { name: 'Sprints' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    sinSkeleton();
  });

  it('error transitorio (500): alerta con «Reintentar» que vuelve a pedir el proyecto', () => {
    const { refetchProyecto } = escenario({ proyectoError: httpError(500) });

    expect(screen.getByRole('alert')).toHaveTextContent('No fue posible cargar el proyecto.');
    expect(screen.queryByText(/no eres líder/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(refetchProyecto).toHaveBeenCalledTimes(1);
    sinSkeleton();
  });

  it('mientras el proyecto carga hay skeleton y ningún estado terminal', () => {
    escenario({ cargandoProyecto: true, sprints: { isLoading: true } });

    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    expect(screen.queryByText('Proyecto no encontrado')).not.toBeInTheDocument();
    expect(screen.queryByText(/no eres líder/i)).not.toBeInTheDocument();
  });
});

describe('GPI01-C05: proyecto cerrado y errores de la lista', () => {
  it('líder de un proyecto CERRADO sin Sprints: aviso de solo lectura y estado vacío', () => {
    escenario({ proyectoData: proyecto('CERRADO') });

    expect(screen.getByText(/El proyecto está cerrado: sus Sprints son históricos/)).toBeInTheDocument();
    expect(screen.getByText('Aún no hay Sprints en este proyecto.')).toBeInTheDocument();
    sinSkeleton();
  });

  it('la lista responde 403: mensaje terminal sin «Reintentar»', () => {
    escenario({ proyectoData: proyecto('EN_PROGRESO'), sprints: { isError: true, error: httpError(403) } });

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    sinSkeleton();
  });

  it('la lista falla por un error transitorio: «Reintentar» vuelve a pedirla', () => {
    const { refetchSprints } = escenario({ proyectoData: proyecto('EN_PROGRESO'), sprints: { isError: true, error: httpError(500) } });

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(refetchSprints).toHaveBeenCalledTimes(1);
  });

  it('un no-líder conserva el aviso de siempre', () => {
    escenario({ proyectoData: proyecto('EN_PROGRESO'), userId: 999 });

    expect(screen.getByText('No puedes acceder a los Sprints de este proyecto.')).toBeInTheDocument();
  });
});

describe('GPI01-C05: los errores terminales no se reintentan en ninguna lectura', () => {
  function wrapper({ children }: { children: ReactNode }) {
    // Misma política que app/providers.tsx; retryDelay 0 para no esperar el backoff.
    const client = new QueryClient({ defaultOptions: { queries: { retry: reintentarSiNoEsTerminal, retryDelay: 0 } } });
    return createElement(QueryClientProvider, { client }, children);
  }

  it('el cliente de consultas de la aplicación usa esa política', () => {
    const providers = readFileSync(join(__dirname, '../app/providers.tsx'), 'utf8');
    expect(providers).toMatch(/queries: \{[^}]*retry: reintentarSiNoEsTerminal/);
  });

  it.each([401, 403, 404])('un %i es terminal', (status) => {
    expect(reintentarSiNoEsTerminal(0, httpError(status))).toBe(false);
  });

  it('un 5xx o un fallo de red conservan tres reintentos', () => {
    expect(reintentarSiNoEsTerminal(0, httpError(503))).toBe(true);
    expect(reintentarSiNoEsTerminal(2, new Error('Failed to fetch'))).toBe(true);
    expect(reintentarSiNoEsTerminal(3, httpError(503))).toBe(false);
  });

  it.each([403, 404])('la lista de Sprints pide un %i una sola vez', async (status) => {
    const { useProjectSprints: real } = await vi.importActual<typeof import('../hooks/use-project-sprints')>(
      '../hooks/use-project-sprints',
    );
    (getProjectSprints as any).mockRejectedValue(httpError(status));
    const { result } = renderHook(() => real(42), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(getProjectSprints).toHaveBeenCalledTimes(1);
  });

  it('la lista de Sprints reintenta un 503 hasta resolver', async () => {
    const { useProjectSprints: real } = await vi.importActual<typeof import('../hooks/use-project-sprints')>(
      '../hooks/use-project-sprints',
    );
    (getProjectSprints as any).mockRejectedValueOnce(httpError(503)).mockResolvedValue([]);
    const { result } = renderHook(() => real(42), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isError).toBe(false);
    expect(getProjectSprints).toHaveBeenCalledTimes(2);
  });
});
