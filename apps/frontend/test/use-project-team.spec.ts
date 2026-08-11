import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../lib/api/client', () => ({ apiFetch: vi.fn() }));

import { useProjectTeam } from '../hooks/use-project-team';
import { useProjectMembers } from '../hooks/use-project-members';
import { projectMembersQueryKey } from '../lib/query-keys/members';
import { apiFetch } from '../lib/api/client';
import type { ParticipacionActivaDTO } from '../lib/dto/member.dto';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

const FIXTURE: ParticipacionActivaDTO[] = [
  {
    idParticipacion: 9,
    estadoParticipacion: 'ACTIVO',
    fechaIngreso: '2026-02-01T00:00:00.000Z',
    tareasActivas: 3,
    horasRegistradas: 12.5,
    usuario: { idUsuario: 11, nombre: 'Luis', apellido: 'Perez', correo: 'luis@uvg.edu.gt', fotoUrl: null },
    rolProyecto: { idRolProyecto: 3, nombreRol: 'QA', descripcionRolProyecto: null },
  },
];

describe('useProjectTeam', () => {
  afterEach(() => vi.clearAllMocks());

  it('usa el endpoint real GET /proyectos/:id/equipo (mismo que useProjectMembers)', async () => {
    (apiFetch as any).mockResolvedValue([]);
    const { wrapper } = createWrapper();
    renderHook(() => useProjectTeam(7), { wrapper });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/proyectos/7/equipo'));
  });

  it('un idProyecto inválido no consulta', async () => {
    (apiFetch as any).mockResolvedValue([]);
    const { wrapper } = createWrapper();
    renderHook(() => useProjectTeam(-1), { wrapper });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('expone la respuesta sin aplanar, con tareasActivas y horasRegistradas incluidos', async () => {
    (apiFetch as any).mockResolvedValue(FIXTURE);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useProjectTeam(7), { wrapper });

    await waitFor(() => expect(result.current.equipo).toHaveLength(1));
    expect(result.current.equipo[0]).toEqual(FIXTURE[0]);
  });

  it('expone equipo por defecto [] antes de resolver', () => {
    (apiFetch as any).mockReturnValue(new Promise(() => {}));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useProjectTeam(7), { wrapper });
    expect(result.current.equipo).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  it('preserva isError, error y equipo=[] cuando la petición falla', async () => {
    const fallo = new Error('fallo de red');
    (apiFetch as any).mockRejectedValue(fallo);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useProjectTeam(7), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(fallo);
    expect(result.current.equipo).toEqual([]);
    expect(typeof result.current.refetch).toBe('function');
  });

  it('cachea la query bajo exactamente projectMembersQueryKey(idProyecto)', async () => {
    (apiFetch as any).mockResolvedValue([]);
    const { queryClient, wrapper } = createWrapper();
    renderHook(() => useProjectTeam(99), { wrapper });

    await waitFor(() => {
      expect(queryClient.getQueryCache().find({ queryKey: projectMembersQueryKey(99) })).toBeDefined();
    });
  });

  it('comparte caché con useProjectMembers para el mismo proyecto: una sola petición de red', async () => {
    (apiFetch as any).mockResolvedValue(FIXTURE);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    renderHook(() => useProjectTeam(50), { wrapper });
    renderHook(() => useProjectMembers(50), { wrapper });

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
  });
});
