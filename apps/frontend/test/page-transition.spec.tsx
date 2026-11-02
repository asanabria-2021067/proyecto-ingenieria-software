import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const animateMock = vi.fn();
let reducir = false;

vi.mock('framer-motion', () => ({
  animate: (...a: unknown[]) => animateMock(...a),
  useReducedMotion: () => reducir,
}));

beforeEach(() => {
  vi.resetModules();
  reducir = false;
});
afterEach(cleanup);

async function montar(texto: string) {
  const { PageTransition } = await import('@/components/ui/page-transition');
  return render(
    <PageTransition>
      <div className="card-base">{texto}</div>
    </PageTransition>,
  );
}

describe('PageTransition (MEJ-76)', () => {
  it('la carga dura no anima (el HTML ya esta pintado) y siempre muestra el contenido', async () => {
    await montar('Tarjeta');
    expect(screen.getByText('Tarjeta')).toBeInTheDocument();
    expect(animateMock).not.toHaveBeenCalled();
  });

  it('en la navegacion siguiente anima pagina y tarjetas en menos de 250 ms', async () => {
    await montar('Primera');
    cleanup();
    await montar('Segunda');
    expect(animateMock).toHaveBeenCalledTimes(2);
    for (const [, , opciones] of animateMock.mock.calls) expect(opciones.duration).toBeLessThan(0.25);
  });

  it('con prefers-reduced-motion no anima nunca', async () => {
    reducir = true;
    await montar('Primera');
    cleanup();
    await montar('Segunda');
    expect(animateMock).not.toHaveBeenCalled();
  });
});
