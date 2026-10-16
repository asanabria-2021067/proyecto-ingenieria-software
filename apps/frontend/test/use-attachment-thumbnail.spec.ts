import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

const getAttachmentThumbnail = vi.fn();
vi.mock('@/lib/services/chat', () => ({
  getAttachmentThumbnail: (...a: unknown[]) => getAttachmentThumbnail(...a),
}));

import { useAttachmentThumbnail } from '../hooks/use-chat';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

afterEach(() => vi.clearAllMocks());

describe('useAttachmentThumbnail', () => {
  it('convierte los bytes del backend en una URL data: para <img>', async () => {
    getAttachmentThumbnail.mockResolvedValue(new Blob(['x'], { type: 'image/png' }));
    const { result } = renderHook(() => useAttachmentThumbnail(10, 5, 7, true), { wrapper });
    await waitFor(() => expect(result.current.data).toMatch(/^data:image\/png;base64,/));
    expect(getAttachmentThumbnail).toHaveBeenCalledWith(10, 5, 7);
  });

  it('no pide nada si no esta habilitado', () => {
    const { result } = renderHook(() => useAttachmentThumbnail(10, 5, 7, false), { wrapper });
    expect(result.current.data).toBeUndefined();
    expect(getAttachmentThumbnail).not.toHaveBeenCalled();
  });
});
