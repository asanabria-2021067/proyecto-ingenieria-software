import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../lib/api/client', () => ({ apiFetch: vi.fn() }));

import { apiFetch } from '../lib/api/client';
import { getAccessibleProjectById } from '../lib/services/projects';
import { useProjectDetail } from '../hooks/use-project-detail';

/**
 * GPI01-C04 (H-03). El GET público `/proyectos/:id` solo sirve estados con
 * detalle público; un proyecto CERRADO (o aún no publicado) responde 404 aunque
 * quien lo pide sea su líder, un participante o un administrador. La lectura
 * del dashboard recurre entonces a la ruta autorizada `/proyectos/:id/owner`,
 * que decide por la política de lectura del backend. Solo el 404 público
 * dispara el respaldo, y sus errores (403/404) son terminales.
 */

const mock = apiFetch as unknown as ReturnType<typeof vi.fn>;

function httpError(statusCode: number) {
  return Object.assign(new Error(`HTTP ${statusCode}`), { statusCode });
}

/** Responde por ruta; lo no previsto falla la prueba en vez de devolver undefined. */
function rutas(tabla: Record<string, unknown>) {
  mock.mockImplementation((ruta: string) => {
    if (!(ruta in tabla)) return Promise.reject(new Error(`ruta inesperada: ${ruta}`));
    const valor = tabla[ruta];
    return valor instanceof Error ? Promise.reject(valor) : Promise.resolve(valor);
  });
}

const llamadas = () => mock.mock.calls.map((c) => c[0] as string);

beforeEach(() => {
  mock.mockReset();
});

describe('GPI01-C04: getAccessibleProjectById', () => {
  it('proyecto con detalle público: una sola petición, sin tocar la ruta autorizada', async () => {
    rutas({ '/proyectos/7': { idProyecto: 7, estadoProyecto: 'EN_PROGRESO' } });
    const proyecto = await getAccessibleProjectById(7);
    expect(proyecto).toEqual({ idProyecto: 7, estadoProyecto: 'EN_PROGRESO' });
    expect(proyecto.lecturaAutorizada).toBeUndefined();
    expect(llamadas()).toEqual(['/proyectos/7']);
  });

  it('proyecto cerrado para quien puede leerlo: 404 público y luego la ruta autorizada', async () => {
    rutas({ '/proyectos/64': httpError(404), '/proyectos/64/owner': { idProyecto: 64, estadoProyecto: 'CERRADO' } });
    const proyecto = await getAccessibleProjectById(64);
    expect(proyecto).toMatchObject({ idProyecto: 64, estadoProyecto: 'CERRADO', lecturaAutorizada: true });
    expect(llamadas()).toEqual(['/proyectos/64', '/proyectos/64/owner']);
  });

  it('proyecto cerrado para un tercero: el 403 de la ruta autorizada se propaga', async () => {
    rutas({ '/proyectos/64': httpError(404), '/proyectos/64/owner': httpError(403) });
    await expect(getAccessibleProjectById(64)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('proyecto inexistente: sigue siendo 404', async () => {
    rutas({ '/proyectos/999': httpError(404), '/proyectos/999/owner': httpError(404) });
    await expect(getAccessibleProjectById(999)).rejects.toMatchObject({ statusCode: 404 });
  });

  it.each([401, 403, 500])('un %i del GET público no dispara el respaldo', async (status) => {
    rutas({ '/proyectos/7': httpError(status) });
    await expect(getAccessibleProjectById(7)).rejects.toMatchObject({ statusCode: status });
    expect(llamadas()).toEqual(['/proyectos/7']);
  });

  it('un error de red no se confunde con un 404', async () => {
    rutas({ '/proyectos/7': new Error('Failed to fetch') });
    await expect(getAccessibleProjectById(7)).rejects.toThrow('Failed to fetch');
    expect(llamadas()).toEqual(['/proyectos/7']);
  });
});

describe('GPI01-C04: useProjectDetail', () => {
  function wrapper({ children }: { children: ReactNode }) {
    // retryDelay 0: se prueba la política de reintentos del hook, no su espera.
    const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
    return createElement(QueryClientProvider, { client }, children);
  }

  it('proyecto cerrado: resuelve con la lectura autorizada y un único 404 público', async () => {
    rutas({ '/proyectos/64': httpError(404), '/proyectos/64/owner': { idProyecto: 64, estadoProyecto: 'CERRADO' } });
    const { result } = renderHook(() => useProjectDetail(64), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({ idProyecto: 64, estadoProyecto: 'CERRADO' });
    expect(llamadas().filter((r) => r === '/proyectos/64')).toHaveLength(1);
  });

  it.each([403, 404])('un %i terminal no se reintenta', async (status) => {
    rutas({ '/proyectos/64': httpError(404), '/proyectos/64/owner': httpError(status) });
    const { result } = renderHook(() => useProjectDetail(64), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(llamadas()).toEqual(['/proyectos/64', '/proyectos/64/owner']);
  });

  it('un fallo transitorio sí se reintenta', async () => {
    let intentos = 0;
    mock.mockImplementation(() => {
      intentos++;
      return intentos < 3 ? Promise.reject(httpError(503)) : Promise.resolve({ idProyecto: 7, estadoProyecto: 'EN_PROGRESO' });
    });
    const { result } = renderHook(() => useProjectDetail(7), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(intentos).toBe(3);
  });
});
