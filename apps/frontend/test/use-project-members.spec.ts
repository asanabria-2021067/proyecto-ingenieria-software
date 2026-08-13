import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../lib/api/client', () => ({ apiFetch: vi.fn() }));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

import { useProjectMembers, projectMembersQueryKey } from '../hooks/use-project-members';
import { apiFetch } from '../lib/api/client';
import type { MiembroProyecto, ParticipacionActivaDTO } from '../lib/dto/member.dto';
import { redirect } from 'next/navigation';
import EquipoProyectoPage from '../app/dashboard/proyectos/[id]/equipo/page';

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

describe('projectMembersQueryKey (factory centralizada — Tarea 3)', () => {
  it('produce el literal exacto ["proyecto-equipo", id], no solo longitud 2', () => {
    expect(projectMembersQueryKey(42)).toEqual(['proyecto-equipo', 42]);
  });
});

describe('useProjectMembers usa la factory como key efectiva de React Query', () => {
  afterEach(() => vi.clearAllMocks());

  it('cachea la query bajo exactamente projectMembersQueryKey(idProyecto)', async () => {
    (apiFetch as any).mockResolvedValue([]);
    const { queryClient, wrapper } = createWrapper();
    renderHook(() => useProjectMembers(99), { wrapper });

    await waitFor(() => {
      expect(queryClient.getQueryCache().find({ queryKey: projectMembersQueryKey(99) })).toBeDefined();
    });

    const cachedKeys = queryClient.getQueryCache().getAll().map((q) => q.queryKey);
    expect(cachedKeys).toContainEqual(['proyecto-equipo', 99]);
  });
});

describe('useProjectMembers — retorno público completo', () => {
  afterEach(() => vi.clearAllMocks());

  it('preserva isError, error y members=[] cuando la petición falla', async () => {
    const fallo = new Error('fallo de red');
    (apiFetch as any).mockRejectedValue(fallo);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useProjectMembers(7), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(fallo);
    expect(result.current.members).toEqual([]);
    expect(typeof result.current.refetch).toBe('function');
  });

  it('expone isFetching true mientras la petición está en curso', () => {
    (apiFetch as any).mockReturnValue(new Promise(() => {}));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useProjectMembers(7), { wrapper });
    expect(result.current.isFetching).toBe(true);
  });
});

describe('useProjectMembers — DTO compartido actual (HU-123/T-106 vive en un DTO person-centric aparte, ver member.dto.ts)', () => {
  afterEach(() => vi.clearAllMocks());

  it('aplana un fixture tipado con ParticipacionActivaDTO al MiembroProyecto vigente', async () => {
    const fixture: ParticipacionActivaDTO[] = [
      {
        idParticipacion: 9,
        estadoParticipacion: 'ACTIVO',
        fechaIngreso: '2026-02-01T00:00:00.000Z',
        usuario: { idUsuario: 11, nombre: 'Luis', apellido: 'Perez', correo: 'luis@uvg.edu.gt', fotoUrl: null },
        rolProyecto: { idRolProyecto: 3, nombreRol: 'QA', descripcionRolProyecto: null },
      },
    ];
    (apiFetch as any).mockResolvedValue(fixture);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useProjectMembers(7), { wrapper });

    await waitFor(() => expect(result.current.members).toHaveLength(1));
    const esperado: MiembroProyecto = {
      idUsuario: 11,
      nombre: 'Luis',
      apellido: 'Perez',
      correo: 'luis@uvg.edu.gt',
      fotoUrl: null,
      idRolProyecto: 3,
    };
    expect(result.current.members[0]).toEqual(esperado);
  });
});

describe('ruta legacy /equipo (item 10 del review HU-123): redirect hacia /miembros', () => {
  afterEach(() => vi.clearAllMocks());

  it('redirige a /dashboard/proyectos/:id/miembros en vez de renderizar una vista propia', async () => {
    await EquipoProyectoPage({ params: Promise.resolve({ id: '42' }) });

    expect(redirect).toHaveBeenCalledWith('/dashboard/proyectos/42/miembros');
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
