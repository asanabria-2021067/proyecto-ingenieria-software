import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

const apiFetch = vi.fn();
vi.mock('@/lib/api/client', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

import { getLinkPreview } from '../lib/services/chat';
import { useLinkPreview } from '../hooks/use-chat';

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client: new QueryClient() }, children);

afterEach(() => apiFetch.mockReset());

describe('vista previa de links: servicio y hook', () => {
  it('el servicio hace POST con la URL en el cuerpo', async () => {
    apiFetch.mockResolvedValue({ url: 'https://a.com' });
    await getLinkPreview(3, 4, 'https://a.com');
    expect(apiFetch).toHaveBeenCalledWith('/proyectos/3/conversaciones/4/vista-previa', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://a.com' }),
    });
  });

  it('el hook consulta una vez y no reintenta si falla', async () => {
    apiFetch.mockRejectedValue(new Error('422'));
    const { result } = renderHook(() => useLinkPreview(3, 4, 'https://a.com'), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('con url null no consulta', () => {
    renderHook(() => useLinkPreview(3, 4, null), { wrapper });
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
