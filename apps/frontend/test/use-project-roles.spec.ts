import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';

// Servicios de roles mockeados: la prueba verifica las INVALIDACIONES de caché
// (Sección 57), no la red.
vi.mock('../lib/services/roles', () => ({
  getProjectRoles: vi.fn().mockResolvedValue({ isLeader: true, roles: [] }),
  createProjectRole: vi.fn().mockResolvedValue({ idRolProyecto: 1 }),
  updateProjectRole: vi.fn().mockResolvedValue({ idRolProyecto: 1 }),
  deleteProjectRole: vi.fn().mockResolvedValue({ idRolProyecto: 1, eliminado: true }),
  selfAssignRole: vi.fn().mockResolvedValue({ idRolProyecto: 1, estadoParticipacion: 'ACTIVO', yaParticipaba: false }),
  leaveRole: vi.fn().mockResolvedValue({ idRolProyecto: 1, estadoParticipacion: 'RETIRADO', tareasDesasignadas: 2 }),
}));

import { useProjectRoles } from '../hooks/use-project-roles';

const invalidateCalls: string[] = [];

describe('useProjectRoles — invalidaciones (Sección 57)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    invalidateCalls.length = 0;
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // Sustituye invalidateQueries por un espía simple que registra las
    // queryKeys invalidadas (evita las gimnasias de tipos de vi.spyOn sobre un
    // método genérico).
    queryClient.invalidateQueries = ((arg: { queryKey?: unknown }) => {
      invalidateCalls.push(JSON.stringify(arg?.queryKey));
      return Promise.resolve();
    }) as typeof queryClient.invalidateQueries;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  function render() {
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    return renderHook(() => useProjectRoles(42), { wrapper });
  }

  it('tras asignarse a un rol invalida roles, proyecto y equipo/participaciones', async () => {
    const { result } = render();
    await result.current.asignarmeRol.mutateAsync({ roleId: 5 });

    await waitFor(() => {
      expect(invalidateCalls).toContain(JSON.stringify(['project-roles', 42]));
      expect(invalidateCalls).toContain(JSON.stringify(['project', 42]));
      expect(invalidateCalls).toContain(JSON.stringify(['proyecto-equipo', 42]));
    });
  });

  it('tras retirarse de un rol invalida además tareas y avance', async () => {
    const { result } = render();
    await result.current.salirDeRol.mutateAsync({ roleId: 5 });

    await waitFor(() => {
      expect(invalidateCalls).toContain(JSON.stringify(['project-roles', 42]));
      expect(invalidateCalls).toContain(JSON.stringify(['proyecto-equipo', 42]));
      expect(invalidateCalls).toContain(JSON.stringify(['project-tasks', 42]));
      expect(invalidateCalls).toContain(JSON.stringify(['project-avance', 42]));
    });
  });
});
