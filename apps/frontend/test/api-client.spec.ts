import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../lib/api/client';

describe('api client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('apiFetch manda credentials include y retorna json', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    } as Response);

    const result = await apiFetch('/x');

    expect(result).toEqual({ ok: true });
    const req = (globalThis.fetch as any).mock.calls[0];
    expect(req[1].credentials).toBe('include');
    expect(req[1].headers.Authorization).toBeUndefined();
  });

  it('apiFetch levanta error enriquecido', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ statusCode: 400, message: ['a', 'b'] }),
    } as Response);

    await expect(apiFetch('/x')).rejects.toMatchObject({
      message: 'a, b',
      statusCode: 400,
    });
  });

  it('en 401, reintenta una vez tras un refresh silencioso exitoso', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) } as Response) // request original
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) } as Response) // /auth/refresh
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ retried: true }) } as Response); // reintento

    const result = await apiFetch('/x');

    expect(result).toEqual({ retried: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect((fetchMock.mock.calls[1][0] as string)).toContain('/auth/refresh');
  });

  it('en 401, si el refresh también falla, propaga el error original sin loop', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ message: 'no auth' }) } as Response)
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) } as Response); // /auth/refresh falla

    await expect(apiFetch('/x')).rejects.toMatchObject({ message: 'no auth' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
