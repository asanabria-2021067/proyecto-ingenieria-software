import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';

vi.mock('../hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }));
vi.mock('../hooks/use-project-detail', () => ({ useProjectDetail: vi.fn() }));

import { useIsProjectLeader } from '../hooks/use-is-project-leader';
import { useCurrentUser } from '../hooks/use-current-user';
import { useProjectDetail } from '../hooks/use-project-detail';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return wrapper;
}

describe('useIsProjectLeader', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('true cuando el usuario identificado (vía cookie JWT) es el creador del proyecto', () => {
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 1 } });
    (useProjectDetail as any).mockReturnValue({ data: { creador: { idUsuario: 1 } } });

    const { result } = renderHook(() => useIsProjectLeader(42), { wrapper: createWrapper() });

    expect(result.current).toBe(true);
  });

  it('false cuando el usuario identificado no es el creador del proyecto', () => {
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 999 } });
    (useProjectDetail as any).mockReturnValue({ data: { creador: { idUsuario: 1 } } });

    const { result } = renderHook(() => useIsProjectLeader(42), { wrapper: createWrapper() });

    expect(result.current).toBe(false);
  });

  it('false mientras el usuario o el proyecto todavía no cargan (nunca un falso positivo)', () => {
    (useCurrentUser as any).mockReturnValue({ data: undefined });
    (useProjectDetail as any).mockReturnValue({ data: undefined });

    const { result } = renderHook(() => useIsProjectLeader(42), { wrapper: createWrapper() });

    expect(result.current).toBe(false);
  });
});
