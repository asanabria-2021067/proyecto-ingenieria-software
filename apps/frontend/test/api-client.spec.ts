import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, getUserIdFromToken } from '../lib/api/client';

describe('api client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('apiFetch envía auth header y retorna json', async () => {
    localStorage.setItem('token', 'abc.def.ghi');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    } as Response);

    const result = await apiFetch('/x');

    expect(result).toEqual({ ok: true });
    const req = (globalThis.fetch as any).mock.calls[0];
    expect(req[1].headers.Authorization).toBe('Bearer abc.def.ghi');
  });

  it('apiFetch levanta error enriquecido', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => ({ statusCode: 400, message: ['a', 'b'] }),
    } as Response);

    await expect(apiFetch('/x')).rejects.toMatchObject({
      message: 'a, b',
      statusCode: 400,
    });
  });

  it('getUserIdFromToken parsea sub', () => {
    const payload = btoa(JSON.stringify({ sub: 55 }));
    localStorage.setItem('token', `x.${payload}.y`);
    expect(getUserIdFromToken()).toBe(55);
  });
});
