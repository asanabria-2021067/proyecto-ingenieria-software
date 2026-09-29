import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

// HU-154 (T-215): el contexto decide el actor una sola vez para todas las
// superficies de navegación y solo consulta la solicitud de salida cuando el
// actor es participante.

vi.mock('@/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }));
vi.mock('@/hooks/use-project-detail', () => ({ useProjectDetail: vi.fn() }));
vi.mock('@/hooks/use-project-members', () => ({ useProjectMembers: vi.fn() }));
vi.mock('@/hooks/use-exit-request', () => ({ useCurrentExitRequest: vi.fn() }));

import { useProjectNavContext } from '@/components/projects/navigation/use-project-nav-context';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useProjectDetail } from '@/hooks/use-project-detail';
import { useProjectMembers } from '@/hooks/use-project-members';
import { useCurrentExitRequest } from '@/hooks/use-exit-request';

const SOLICITUD = { idSolicitud: 1, estadoSolicitud: 'PREPARACION' };

function mockEscenario({
  userId,
  creadorId = 1,
  members = [],
  estado = 'EN_PROGRESO',
  solicitud = null,
  sinProyecto = false,
}: {
  userId: number | null;
  creadorId?: number;
  members?: { idUsuario: number }[];
  estado?: string;
  solicitud?: unknown;
  sinProyecto?: boolean;
}) {
  (useCurrentUser as any).mockReturnValue({ data: userId == null ? undefined : { idUsuario: userId } });
  (useProjectDetail as any).mockReturnValue({
    data: sinProyecto
      ? undefined
      : { idProyecto: 42, tituloProyecto: 'Proyecto de prueba', estadoProyecto: estado, creador: { idUsuario: creadorId } },
  });
  (useProjectMembers as any).mockReturnValue({ members });
  (useCurrentExitRequest as any).mockReturnValue({ request: solicitud });
}

function ultimaLlamadaSalida() {
  const calls = (useCurrentExitRequest as any).mock.calls;
  return calls[calls.length - 1];
}

describe('useProjectNavContext', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('líder: actor leader, sin consultar su solicitud de salida', () => {
    mockEscenario({ userId: 1, solicitud: SOLICITUD });
    const { result } = renderHook(() => useProjectNavContext(42));

    expect(result.current).toMatchObject({
      idProyecto: 42,
      actor: 'leader',
      estadoProyecto: 'EN_PROGRESO',
      tieneSolicitudSalida: false,
      tituloProyecto: 'Proyecto de prueba',
      currentUserId: 1,
    });
    expect(ultimaLlamadaSalida()).toEqual([42, { habilitado: false }]);
  });

  it('el líder que además ocupa un rol sigue siendo leader', () => {
    mockEscenario({ userId: 1, members: [{ idUsuario: 1 }] });
    const { result } = renderHook(() => useProjectNavContext(42));

    expect(result.current.actor).toBe('leader');
    expect(ultimaLlamadaSalida()).toEqual([42, { habilitado: false }]);
  });

  it('participante con solicitud abierta: actor participant y consulta habilitada', () => {
    mockEscenario({ userId: 2, members: [{ idUsuario: 2 }], solicitud: SOLICITUD });
    const { result } = renderHook(() => useProjectNavContext(42));

    expect(result.current.actor).toBe('participant');
    expect(result.current.tieneSolicitudSalida).toBe(true);
    expect(result.current.members).toEqual([{ idUsuario: 2 }]);
    expect(ultimaLlamadaSalida()).toEqual([42, { habilitado: true }]);
  });

  it('participante sin solicitud: tieneSolicitudSalida false', () => {
    mockEscenario({ userId: 2, members: [{ idUsuario: 2 }], solicitud: null });
    const { result } = renderHook(() => useProjectNavContext(42));

    expect(result.current.actor).toBe('participant');
    expect(result.current.tieneSolicitudSalida).toBe(false);
  });

  it('visitante (no líder ni miembro): actor visitor, consulta deshabilitada', () => {
    mockEscenario({ userId: 9, members: [{ idUsuario: 2 }], estado: 'PUBLICADO' });
    const { result } = renderHook(() => useProjectNavContext(42));

    expect(result.current).toMatchObject({ actor: 'visitor', estadoProyecto: 'PUBLICADO', tieneSolicitudSalida: false });
    expect(ultimaLlamadaSalida()).toEqual([42, { habilitado: false }]);
  });

  it('mientras usuario y proyecto cargan: visitor sin estado ni consulta de salida', () => {
    mockEscenario({ userId: null, sinProyecto: true });
    const { result } = renderHook(() => useProjectNavContext(42));

    expect(result.current).toMatchObject({
      actor: 'visitor',
      estadoProyecto: undefined,
      tituloProyecto: null,
      currentUserId: null,
      tieneSolicitudSalida: false,
    });
    expect(ultimaLlamadaSalida()).toEqual([42, { habilitado: false }]);
  });

  it('al cambiar de proyecto consulta todo con el nuevo id', () => {
    mockEscenario({ userId: 2, members: [{ idUsuario: 2 }] });
    const { result, rerender } = renderHook(({ id }: { id: number }) => useProjectNavContext(id), {
      initialProps: { id: 42 },
    });
    expect(result.current.idProyecto).toBe(42);

    rerender({ id: 43 });
    expect(result.current.idProyecto).toBe(43);
    expect(useProjectDetail).toHaveBeenLastCalledWith(43);
    expect(useProjectMembers).toHaveBeenLastCalledWith(43);
    expect(ultimaLlamadaSalida()).toEqual([43, { habilitado: true }]);
  });
});
