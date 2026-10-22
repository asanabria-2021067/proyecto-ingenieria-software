import '@testing-library/jest-dom/vitest';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const gsapMock = vi.hoisted(() => {
  const revert = vi.fn();
  return {
    revert,
    context: vi.fn((fn: () => void) => {
      fn();
      return { revert };
    }),
    to: vi.fn(),
    from: vi.fn(),
  };
});

vi.mock('gsap', () => ({ gsap: gsapMock, default: gsapMock }));
vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: { src?: string } | string }) => (
    <span data-testid="logo-uvg" data-alt={alt} data-src={typeof src === 'string' ? src : src?.src} />
  ),
}));
vi.mock('@/public/Logo UVG-01.png', () => ({ default: { src: '/Logo UVG-01.png', width: 1390, height: 1390 } }));

import { ETIQUETA_ILUSTRACION_UVG, IlustracionUvg } from '../components/contacto/ilustracion-uvg';
import { useAnimacionEntrada } from '../components/contacto/use-animacion-entrada';
import { prefiereMovimientoReducido } from '../components/contacto/movimiento-reducido';

function movimientoReducido(activo: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: activo }) as unknown as typeof window.matchMedia;
}

function Entrada() {
  const raiz = useRef<HTMLDivElement>(null);
  useAnimacionEntrada(raiz);
  return (
    <div ref={raiz}>
      <div data-contacto-encabezado>
        <span>Contacto</span>
      </div>
      <div data-contacto-columna>
        <div data-contacto-tarjeta>uno</div>
      </div>
    </div>
  );
}

const matchMediaOriginal = window.matchMedia;

beforeEach(() => movimientoReducido(false));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.matchMedia = matchMediaOriginal;
});

describe('prefiereMovimientoReducido', () => {
  it('sigue la preferencia del sistema', () => {
    movimientoReducido(true);
    expect(prefiereMovimientoReducido()).toBe(true);
    movimientoReducido(false);
    expect(prefiereMovimientoReducido()).toBe(false);
  });

  it('sin matchMedia no asume movimiento reducido', () => {
    window.matchMedia = undefined as unknown as typeof window.matchMedia;
    expect(prefiereMovimientoReducido()).toBe(false);
  });
});

describe('IlustracionUvg', () => {
  it('es una sola imagen accesible con el logo de la UVG del proyecto y una esfera en malla', () => {
    const { container } = render(<IlustracionUvg />);

    const ilustracion = screen.getByRole('img', { name: ETIQUETA_ILUSTRACION_UVG });
    expect(ilustracion).toBeInTheDocument();
    expect(screen.getByTestId('logo-uvg')).toHaveAttribute('data-src', '/Logo UVG-01.png');
    expect(screen.getByTestId('logo-uvg')).toHaveAttribute('data-alt', '');
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg?.querySelectorAll('[data-ilustracion-esfera] ellipse').length).toBeGreaterThanOrEqual(8);
  });

  it('usa los colores del tema, sin colores fijos', () => {
    const { container } = render(<IlustracionUvg />);

    const svg = container.querySelector('svg') as SVGElement;
    expect(svg).toHaveClass('text-primary');
    const pintados = Array.from(svg.querySelectorAll('[stroke], [fill]'))
      .flatMap((nodo) => [nodo.getAttribute('stroke'), nodo.getAttribute('fill')])
      .filter((valor): valor is string => !!valor && valor !== 'none');
    expect(pintados.every((valor) => valor === 'currentColor')).toBe(true);
  });

  it('flota y rota en bucle cuando el usuario no pide movimiento reducido', () => {
    const { unmount } = render(<IlustracionUvg />);

    expect(gsapMock.context).toHaveBeenCalledTimes(1);
    expect(gsapMock.to).toHaveBeenCalledWith(
      '[data-ilustracion-esfera]',
      expect.objectContaining({ rotation: 360, repeat: -1, ease: 'none' }),
    );
    expect(gsapMock.to).toHaveBeenCalledWith(
      '[data-ilustracion-flotante]',
      expect.objectContaining({ yoyo: true, repeat: -1 }),
    );

    unmount();
    expect(gsapMock.revert).toHaveBeenCalledTimes(1);
  });

  it('con movimiento reducido no anima nada', () => {
    movimientoReducido(true);
    render(<IlustracionUvg />);

    expect(screen.getByRole('img', { name: ETIQUETA_ILUSTRACION_UVG })).toBeInTheDocument();
    expect(gsapMock.context).not.toHaveBeenCalled();
    expect(gsapMock.to).not.toHaveBeenCalled();
  });
});

describe('useAnimacionEntrada', () => {
  it('anima encabezado, columnas y tarjetas con desplazamiento, opacidad y escalonado', () => {
    const { unmount } = render(<Entrada />);

    expect(gsapMock.from).toHaveBeenCalledTimes(3);
    for (const selector of ['[data-contacto-encabezado] > *', '[data-contacto-columna]', '[data-contacto-tarjeta]']) {
      expect(gsapMock.from).toHaveBeenCalledWith(
        selector,
        expect.objectContaining({ autoAlpha: 0, y: expect.any(Number), stagger: expect.any(Number) }),
      );
    }

    unmount();
    expect(gsapMock.revert).toHaveBeenCalledTimes(1);
  });

  it('con movimiento reducido deja el contenido quieto', () => {
    movimientoReducido(true);
    render(<Entrada />);

    expect(gsapMock.context).not.toHaveBeenCalled();
    expect(gsapMock.from).not.toHaveBeenCalled();
  });
});
