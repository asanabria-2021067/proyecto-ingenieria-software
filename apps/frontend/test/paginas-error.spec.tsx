import '@testing-library/jest-dom/vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const gsapMock = vi.hoisted(() => {
  const revert = vi.fn();
  return {
    revert,
    context: vi.fn((fn: () => void) => {
      fn();
      return { revert };
    }),
    from: vi.fn(),
  };
});
const routerMock = vi.hoisted(() => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn() }));
const notFoundMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
);
const currentUserMock = vi.hoisted(() =>
  vi.fn(() => ({ data: undefined as { idUsuario: number; roles: string[] } | undefined })),
);

vi.mock('gsap', () => ({ gsap: gsapMock, default: gsapMock }));
vi.mock('next/navigation', () => ({ useRouter: () => routerMock, notFound: notFoundMock }));
vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: { src?: string } | string }) => (
    <span data-testid="logo-uvg" data-alt={alt} data-src={typeof src === 'string' ? src : src?.src} />
  ),
}));
vi.mock('next/font/google', () => ({
  Inter: () => ({ variable: 'fuente-inter' }),
  Manrope: () => ({ variable: 'fuente-manrope' }),
}));
vi.mock('@/public/Logo UVG-01.png', () => ({ default: { src: '/Logo UVG-01.png', width: 1390, height: 1390 } }));
vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => currentUserMock(),
  isAdminUser: (u?: { roles?: string[] } | null) => (u?.roles ?? []).includes('administrador'),
}));

import NotFound from '../app/not-found';
import DashboardNotFound from '../app/dashboard/not-found';
import ErrorDeAplicacion from '../app/error';
import GlobalError from '../app/global-error';
import ErrorSimuladoPage from '../app/e2e/error-simulado/page';
import { rutaDePruebaActiva } from '../app/e2e/error-simulado/ruta-de-prueba';
import { MENSAJE_TECNICO_SIMULADO } from '../app/e2e/error-simulado/provocar-error';
import { aplicarTemaGuardado, temaOscuroGuardado } from '../components/errores/tema-guardado';
import { prefiereMovimientoReducido } from '../components/errores/movimiento-reducido';

const ESTUDIANTE = { idUsuario: 7, roles: ['estudiante'] };
const ADMIN = { idUsuario: 1, roles: ['administrador'] };
const MENSAJE_TECNICO = 'TypeError: Cannot read properties of undefined (reading "idProyecto")';

function errorTecnico(digest?: string) {
  const error = new Error(MENSAJE_TECNICO) as Error & { digest?: string };
  error.stack = `${MENSAJE_TECNICO}\n    at ProyectoDetalle (proyecto.tsx:12:7)`;
  if (digest) error.digest = digest;
  return error;
}

function movimientoReducido(activo: boolean) {
  window.matchMedia = vi.fn().mockImplementation((consulta: string) => ({
    matches: consulta.includes('reduced-motion') ? activo : false,
  })) as unknown as typeof window.matchMedia;
}

const matchMediaOriginal = window.matchMedia;
const historialOriginal = Object.getOwnPropertyDescriptor(window.history, 'length');

beforeEach(() => {
  movimientoReducido(false);
  currentUserMock.mockReturnValue({ data: undefined });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.matchMedia = matchMediaOriginal;
  if (historialOriginal) Object.defineProperty(window.history, 'length', historialOriginal);
  document.documentElement.classList.remove('dark');
  window.localStorage.clear();
});

describe('404 — página no encontrada', () => {
  it('muestra el logo de la UVG, el 404, el título y una explicación', () => {
    render(<NotFound />);

    expect(screen.getByRole('heading', { level: 1, name: 'Página no encontrada' })).toBeInTheDocument();
    expect(screen.getByText('404')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText(/no existe, cambió de dirección/)).toBeInTheDocument();
    expect(screen.getByTestId('logo-uvg')).toHaveAttribute('data-src', '/Logo UVG-01.png');
    expect(screen.getByRole('main')).toHaveClass('min-h-screen');
  });

  it.each([
    ['sin sesión, a la landing', undefined, '/'],
    ['con sesión de estudiante, al dashboard', ESTUDIANTE, '/dashboard'],
    ['con sesión de administración, a su panel', ADMIN, '/dashboard/admin'],
  ])('«Volver al inicio» lleva %s', (_caso, usuario, ruta) => {
    currentUserMock.mockReturnValue({ data: usuario });
    render(<NotFound />);

    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', ruta);
  });

  it('«Regresar» vuelve a la página anterior del historial', () => {
    Object.defineProperty(window.history, 'length', { configurable: true, value: 3 });
    render(<NotFound />);

    fireEvent.click(screen.getByRole('button', { name: 'Regresar' }));

    expect(routerMock.back).toHaveBeenCalledTimes(1);
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it('«Regresar» sin historial previo lleva al inicio en vez de quedarse atascado', () => {
    Object.defineProperty(window.history, 'length', { configurable: true, value: 1 });
    currentUserMock.mockReturnValue({ data: ESTUDIANTE });
    render(<NotFound />);

    fireEvent.click(screen.getByRole('button', { name: 'Regresar' }));

    expect(routerMock.back).not.toHaveBeenCalled();
    expect(routerMock.push).toHaveBeenCalledWith('/dashboard');
  });

  it('dentro del dashboard se muestra como sección del layout, sin un segundo <main>', () => {
    render(<DashboardNotFound />);

    expect(screen.queryByRole('main')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Página no encontrada' })).toBeInTheDocument();
  });

});

describe('error — algo salió mal', () => {
  it('muestra el título y la explicación sin el mensaje técnico ni el stack', () => {
    const { container } = render(<ErrorDeAplicacion error={errorTecnico()} reset={vi.fn()} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Algo salió mal' })).toBeInTheDocument();
    expect(screen.getByText(/error inesperado/)).toBeInTheDocument();
    expect(container.textContent).not.toContain(MENSAJE_TECNICO);
    expect(container.textContent).not.toContain('proyecto.tsx');
    expect(screen.queryByText(/Código de referencia/)).not.toBeInTheDocument();
  });

  it('muestra el digest como código de referencia', () => {
    render(<ErrorDeAplicacion error={errorTecnico('3381948220')} reset={vi.fn()} />);

    expect(screen.getByText('3381948220')).toBeInTheDocument();
    expect(screen.getByText(/Código de referencia/)).toBeInTheDocument();
  });

  it('«Reintentar» llama a reset', () => {
    const reset = vi.fn();
    render(<ErrorDeAplicacion error={errorTecnico()} reset={reset} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(reset).toHaveBeenCalledTimes(1);
  });

  it.each([
    [undefined, '/'],
    [ESTUDIANTE, '/dashboard'],
    [ADMIN, '/dashboard/admin'],
  ])('«Volver al inicio» respeta la sesión', (usuario, ruta) => {
    currentUserMock.mockReturnValue({ data: usuario });
    render(<ErrorDeAplicacion error={errorTecnico()} reset={vi.fn()} />);

    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', ruta);
  });
});

describe('global-error — error del layout raíz', () => {
  it('trae su propio <html> y <body>, el mismo contenido y no expone el error técnico', () => {
    const html = renderToStaticMarkup(<GlobalError error={errorTecnico('ref-1')} reset={vi.fn()} />);

    expect(html).toMatch(/^<html lang="es"/);
    expect(html).toContain('<body');
    expect(html).toContain('fuente-inter');
    expect(html).toContain('Algo salió mal');
    expect(html).toContain('Reintentar');
    expect(html).toContain('ref-1');
    expect(html).not.toContain(MENSAJE_TECNICO);
  });

  it('no depende de los providers: «Volver al inicio» va a la landing aunque no haya sesión resoluble', () => {
    currentUserMock.mockImplementation(() => {
      throw new Error('sin QueryClientProvider');
    });

    const html = renderToStaticMarkup(<GlobalError error={errorTecnico()} reset={vi.fn()} />);

    expect(html).toContain('href="/"');
    expect(currentUserMock).not.toHaveBeenCalled();
  });
});

describe('tema en global-error', () => {
  it('aplica el tema oscuro guardado por next-themes', () => {
    window.localStorage.setItem('theme', 'dark');
    aplicarTemaGuardado();
    expect(document.documentElement).toHaveClass('dark');
  });

  it('el tema claro guardado quita la clase dark', () => {
    document.documentElement.classList.add('dark');
    window.localStorage.setItem('theme', 'light');
    aplicarTemaGuardado();
    expect(document.documentElement).not.toHaveClass('dark');
  });

  it('sin preferencia guardada sigue al sistema', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    expect(temaOscuroGuardado()).toBe(true);
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
    expect(temaOscuroGuardado()).toBe(false);
  });
});

describe('animación de entrada', () => {
  it('entra con desplazamiento, opacidad y escalonado, y se revierte al desmontar', () => {
    const { unmount } = render(<NotFound />);

    expect(gsapMock.from).toHaveBeenCalledWith(
      '[data-error-entrada]',
      expect.objectContaining({ autoAlpha: 0, y: expect.any(Number), stagger: expect.any(Number) }),
    );
    expect(gsapMock.from).toHaveBeenCalledWith('[data-error-codigo]', expect.objectContaining({ scale: expect.any(Number) }));

    unmount();
    expect(gsapMock.revert).toHaveBeenCalledTimes(1);
  });

  it('con movimiento reducido no anima nada', () => {
    movimientoReducido(true);
    expect(prefiereMovimientoReducido()).toBe(true);

    render(<ErrorDeAplicacion error={errorTecnico()} reset={vi.fn()} />);

    expect(gsapMock.context).not.toHaveBeenCalled();
    expect(gsapMock.from).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  });
});

describe('ruta de prueba de errores del E2E', () => {
  it('solo está activa con la variable del E2E', () => {
    expect(rutaDePruebaActiva({} as NodeJS.ProcessEnv)).toBe(false);
    expect(rutaDePruebaActiva({ E2E_PRODUCTION_SERVER: '0' } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(rutaDePruebaActiva({ E2E_PRODUCTION_SERVER: '1' } as unknown as NodeJS.ProcessEnv)).toBe(true);
  });

  it('sin la variable responde notFound() y nunca lanza el error simulado', () => {
    const anterior = process.env.E2E_PRODUCTION_SERVER;
    delete process.env.E2E_PRODUCTION_SERVER;
    try {
      expect(() => ErrorSimuladoPage()).toThrow('NEXT_NOT_FOUND');
    } finally {
      if (anterior !== undefined) process.env.E2E_PRODUCTION_SERVER = anterior;
    }
  });

  it('con la variable activa, el error solo ocurre al pulsar «Provocar error»', () => {
    const anterior = process.env.E2E_PRODUCTION_SERVER;
    process.env.E2E_PRODUCTION_SERVER = '1';
    try {
      render(ErrorSimuladoPage());
      expect(screen.getByRole('button', { name: 'Provocar error' })).toBeInTheDocument();
      const errorConsola = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      expect(() => fireEvent.click(screen.getByRole('button', { name: 'Provocar error' }))).toThrow(MENSAJE_TECNICO_SIMULADO);
      errorConsola.mockRestore();
    } finally {
      if (anterior === undefined) delete process.env.E2E_PRODUCTION_SERVER;
      else process.env.E2E_PRODUCTION_SERVER = anterior;
    }
  });
});
