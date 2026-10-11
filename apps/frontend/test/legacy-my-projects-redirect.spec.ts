import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * GPI01-C03 (H-02). `/dashboard/mis-proyectos` era una página huérfana sin
 * shell que pedía `GET /api/projects/mine` (404). Ahora redirige en el
 * servidor a la ruta canónica `/dashboard/projects/mine`.
 */

const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
vi.mock('next/navigation', () => ({ redirect: (url: string) => redirect(url) }));

import LegacyMyProjectsPage from '../app/dashboard/mis-proyectos/page';
import { middleware } from '../middleware';

const read = (file: string) => readFileSync(join(__dirname, '..', file), 'utf8');

beforeEach(() => {
  redirect.mockClear();
});

describe('GPI01-C03: /dashboard/mis-proyectos redirige a la ruta canónica', () => {
  it('la página redirige a /dashboard/projects/mine', () => {
    expect(() => LegacyMyProjectsPage()).toThrow('NEXT_REDIRECT:/dashboard/projects/mine');
    expect(redirect).toHaveBeenCalledTimes(1);
  });

  it('es un componente de servidor sin la petición obsoleta ni contenido propio', () => {
    const source = read('app/dashboard/mis-proyectos/page.tsx');
    expect(source).not.toMatch(/['"]use client['"]/);
    expect(source).not.toContain('/api/projects');
    expect(source).not.toContain('fetch(');
  });

  it('la ruta canónica existe y el layout ya no trata la antigua como página sin shell', () => {
    expect(read('app/dashboard/projects/mine/page.tsx').length).toBeGreaterThan(0);
    expect(read('app/dashboard/layout.tsx')).not.toContain('/dashboard/mis-proyectos');
  });
});

describe('GPI01-C03: la sesión se respeta antes de redirigir', () => {
  const request = (cookie?: string) =>
    new NextRequest('http://localhost:3000/dashboard/mis-proyectos', cookie ? { headers: { cookie } } : undefined);

  it('sin sesión va al login conservando el destino, sin bucle', () => {
    const response = middleware(request());
    const location = new URL(response.headers.get('location') ?? '');
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('next')).toBe('/dashboard/mis-proyectos');
  });

  it('con sesión el middleware deja pasar y redirige la página', () => {
    const response = middleware(request('access_token=sintetico'));
    expect(response.headers.get('location')).toBeNull();
  });
});
