import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../lib/api/client', () => ({ apiFetch: vi.fn() }));

import { useProjectTeam } from '../hooks/use-project-team';
import { projectTeamSummaryQueryKey, projectMembersQueryKey } from '../lib/query-keys/members';
import { apiFetch } from '../lib/api/client';
import type { ResumenEquipoProyectoDTO } from '../lib/dto/member.dto';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

const FIXTURE: ResumenEquipoProyectoDTO = {
  lider: { idUsuario: 1, nombre: 'Lider', apellido: 'Proyecto', correo: 'lider@uvg.edu.gt', fotoUrl: null },
  miembros: [
    {
      idUsuario: 11,
      nombre: 'Luis',
      apellido: 'Perez',
      correo: 'luis@uvg.edu.gt',
      fotoUrl: null,
      roles: [{ idRolProyecto: 3, nombreRol: 'QA' }],
      estadoParticipacion: 'ACTIVO',
      tareasActivas: 3,
      tareasCompletadas: 1,
      horasReconocidas: 12.5,
    },
  ],
};

describe('useProjectTeam', () => {
  afterEach(() => vi.clearAllMocks());

  it('usa el endpoint canónico GET /proyectos/:id/miembros/resumen (T-106), no /equipo', async () => {
    (apiFetch as any).mockResolvedValue({ lider: null, miembros: [] });
    const { wrapper } = createWrapper();
    renderHook(() => useProjectTeam(7), { wrapper });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/proyectos/7/miembros/resumen'));
    expect(apiFetch).not.toHaveBeenCalledWith('/proyectos/7/equipo');
  });

  it('un idProyecto inválido no consulta', async () => {
    (apiFetch as any).mockResolvedValue({ lider: null, miembros: [] });
    const { wrapper } = createWrapper();
    renderHook(() => useProjectTeam(-1), { wrapper });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('expone lider y miembros[] tal como los devuelve T-106, sin transformarlos', async () => {
    (apiFetch as any).mockResolvedValue(FIXTURE);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useProjectTeam(7), { wrapper });

    await waitFor(() => expect(result.current.miembros).toHaveLength(1));
    expect(result.current.lider).toEqual(FIXTURE.lider);
    expect(result.current.miembros[0]).toEqual(FIXTURE.miembros[0]);
  });

  it('expone lider=null y miembros=[] por defecto antes de resolver', () => {
    (apiFetch as any).mockReturnValue(new Promise(() => {}));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useProjectTeam(7), { wrapper });
    expect(result.current.lider).toBeNull();
    expect(result.current.miembros).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  it('preserva isError, error y miembros=[] cuando la petición falla', async () => {
    const fallo = new Error('fallo de red');
    (apiFetch as any).mockRejectedValue(fallo);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useProjectTeam(7), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(fallo);
    expect(result.current.miembros).toEqual([]);
    expect(typeof result.current.refetch).toBe('function');
  });

  it('cachea la query bajo projectTeamSummaryQueryKey(idProyecto), distinta de projectMembersQueryKey', async () => {
    (apiFetch as any).mockResolvedValue({ lider: null, miembros: [] });
    const { queryClient, wrapper } = createWrapper();
    renderHook(() => useProjectTeam(99), { wrapper });

    await waitFor(() => {
      expect(queryClient.getQueryCache().find({ queryKey: projectTeamSummaryQueryKey(99) })).toBeDefined();
    });
    expect(projectTeamSummaryQueryKey(99)).not.toEqual(projectMembersQueryKey(99));
  });

  it('un integrante con dos roles produce un único elemento en miembros con ambos roles', async () => {
    (apiFetch as any).mockResolvedValue({
      lider: FIXTURE.lider,
      miembros: [
        {
          idUsuario: 100,
          nombre: 'Elena',
          apellido: 'Ruiz',
          correo: 'e@uvg.edu.gt',
          fotoUrl: null,
          roles: [
            { idRolProyecto: 1, nombreRol: 'Backend' },
            { idRolProyecto: 2, nombreRol: 'QA' },
          ],
          estadoParticipacion: 'ACTIVO',
          tareasActivas: 0,
          tareasCompletadas: 0,
          horasReconocidas: 0,
        },
      ],
    });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useProjectTeam(7), { wrapper });

    await waitFor(() => expect(result.current.miembros).toHaveLength(1));
    expect(result.current.miembros[0].idUsuario).toBe(100);
    expect(result.current.miembros[0].roles).toHaveLength(2);
  });
});
