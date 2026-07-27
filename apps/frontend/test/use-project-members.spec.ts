import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../lib/api/client', () => ({ apiFetch: vi.fn() }));

import { useProjectMembers, projectMembersQueryKey } from '../hooks/use-project-members';
import { apiFetch } from '../lib/api/client';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

describe('useProjectMembers', () => {
  afterEach(() => vi.clearAllMocks());

  it('usa el endpoint real GET /proyectos/:id/equipo (sin inventar uno nuevo)', async () => {
    (apiFetch as any).mockResolvedValue([]);
    const { wrapper } = createWrapper();
    renderHook(() => useProjectMembers(7), { wrapper });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/proyectos/7/equipo'));
  });

  it('reutiliza la query key ya usada por la página de equipo', () => {
    expect(projectMembersQueryKey(7)).toEqual(['proyecto-equipo', 7]);
  });

  it('un idProyecto inválido no consulta', async () => {
    (apiFetch as any).mockResolvedValue([]);
    const { wrapper } = createWrapper();
    renderHook(() => useProjectMembers(-1), { wrapper });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('aplana la respuesta real del backend a MiembroProyecto[]', async () => {
    (apiFetch as any).mockResolvedValue([
      {
        idParticipacion: 1,
        estadoParticipacion: 'ACTIVO',
        fechaIngreso: '2026-01-01T00:00:00.000Z',
        usuario: { idUsuario: 5, nombre: 'Ana', apellido: 'Lopez', correo: 'ana@uvg.edu.gt', fotoUrl: null },
        rolProyecto: { idRolProyecto: 2, nombreRol: 'Backend', descripcionRolProyecto: null },
      },
    ]);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useProjectMembers(7), { wrapper });

    await waitFor(() => expect(result.current.members).toHaveLength(1));
    expect(result.current.members[0]).toEqual({
      idUsuario: 5,
      nombre: 'Ana',
      apellido: 'Lopez',
      correo: 'ana@uvg.edu.gt',
      fotoUrl: null,
      idRolProyecto: 2,
    });
  });

  it('expone members por defecto [] antes de resolver', () => {
    (apiFetch as any).mockReturnValue(new Promise(() => {}));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useProjectMembers(7), { wrapper });
    expect(result.current.members).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });
});
