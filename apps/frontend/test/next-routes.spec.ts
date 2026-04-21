import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../app/api/projects/mine/route';
import { PATCH } from '../app/api/projects/[id]/status/route';

describe('next api routes', () => {
  it('GET /api/projects/mine proxyea backend', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      status: 200,
      json: async () => [{ idProyecto: 1 }],
    } as Response);
    const req = new NextRequest('http://localhost/api/projects/mine', {
      headers: { authorization: 'Bearer test' },
    });

    const res = await GET(req);
    const data = await res.json();

    expect(data[0].idProyecto).toBe(1);
    expect((globalThis.fetch as any).mock.calls[0][0]).toContain('/proyectos/mine');
  });

  it('PATCH /api/projects/[id]/status envía nuevoEstado', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      status: 200,
      json: async () => ({ ok: true }),
    } as Response);
    const req = new NextRequest('http://localhost/api/projects/1/status', {
      method: 'PATCH',
      body: JSON.stringify({ estadoProyecto: 'PUBLICADO' }),
      headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: '1' }) });
    const data = await res.json();

    expect(data.ok).toBe(true);
    const call = (globalThis.fetch as any).mock.calls[0];
    expect(call[0]).toContain('/proyectos/1/estado');
    expect(call[1].body).toContain('PUBLICADO');
  });
});
