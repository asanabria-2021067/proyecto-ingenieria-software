import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

/**
 * IESUC-568 (B3, NeuroLab): el aviso en vivo dura al menos 8 s, se pausa con
 * el puntero o con el foco y sigue anunciándose como `status` (aria-live).
 */

const sonner = vi.hoisted(() => ({ dismiss: vi.fn(), custom: vi.fn() }));
vi.mock('sonner', () => ({ toast: sonner }));

import {
  DURACION_NOTIFICACION_EN_VIVO_MS,
  LiveNotificationToast,
  mostrarNotificacionEnVivo,
} from '@/components/notifications/live-notification-toast';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

function mostrar(props: Partial<Parameters<typeof LiveNotificationToast>[0]> = {}) {
  return render(
    createElement(LiveNotificationToast, {
      id: 'n-1',
      titulo: 'Tarea asignada',
      mensaje: 'Te asignaron «Implementar login»',
      ...props,
    }),
  );
}

function avanzar(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('LiveNotificationToast', () => {
  it('se anuncia como status (aria-live polite) con título y mensaje', () => {
    mostrar();

    const aviso = screen.getByRole('status');
    expect(aviso).toHaveAttribute('aria-live', 'polite');
    expect(aviso).toHaveTextContent('Tarea asignada');
    expect(aviso).toHaveTextContent('Te asignaron «Implementar login»');
  });

  it('dura al menos 8 s y se cierra solo al cumplir su duración', () => {
    expect(DURACION_NOTIFICACION_EN_VIVO_MS).toBeGreaterThanOrEqual(8000);
    mostrar();

    avanzar(8000);
    expect(sonner.dismiss).not.toHaveBeenCalled();

    avanzar(DURACION_NOTIFICACION_EN_VIVO_MS - 8000);
    expect(sonner.dismiss).toHaveBeenCalledWith('n-1');
  });

  it('se pausa mientras el puntero está encima y retoma el tiempo restante', () => {
    mostrar();

    avanzar(4000);
    fireEvent.mouseEnter(screen.getByRole('status'));
    expect(screen.getByRole('status')).toHaveAttribute('data-pausado', 'true');
    avanzar(60_000);
    expect(sonner.dismiss).not.toHaveBeenCalled();

    fireEvent.mouseLeave(screen.getByRole('status'));
    avanzar(DURACION_NOTIFICACION_EN_VIVO_MS - 4000 - 1);
    expect(sonner.dismiss).not.toHaveBeenCalled();
    avanzar(1);
    expect(sonner.dismiss).toHaveBeenCalledTimes(1);
  });

  it('se pausa mientras el foco está dentro (teclado) y retoma al salir', () => {
    mostrar({ onVer: vi.fn() });

    avanzar(2000);
    fireEvent.focus(screen.getByRole('button', { name: 'Ver' }));
    avanzar(60_000);
    expect(sonner.dismiss).not.toHaveBeenCalled();

    // Pasar el foco entre controles del propio aviso no lo reanuda.
    fireEvent.blur(screen.getByRole('button', { name: 'Ver' }), {
      relatedTarget: screen.getByRole('button', { name: 'Cerrar notificación' }),
    });
    avanzar(60_000);
    expect(sonner.dismiss).not.toHaveBeenCalled();

    fireEvent.blur(screen.getByRole('button', { name: 'Cerrar notificación' }), { relatedTarget: document.body });
    avanzar(DURACION_NOTIFICACION_EN_VIVO_MS - 2000);
    expect(sonner.dismiss).toHaveBeenCalledTimes(1);
  });

  it('«Ver» navega y cierra; la X cierra', () => {
    const onVer = vi.fn();
    mostrar({ onVer });

    fireEvent.click(screen.getByRole('button', { name: 'Ver' }));
    expect(onVer).toHaveBeenCalledTimes(1);
    expect(sonner.dismiss).toHaveBeenCalledWith('n-1');

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar notificación' }));
    expect(sonner.dismiss).toHaveBeenCalledTimes(2);
  });

  it('sin enlace no ofrece «Ver»', () => {
    mostrar();
    expect(screen.queryByRole('button', { name: 'Ver' })).not.toBeInTheDocument();
  });

  it('usa los tokens de texto y superficie del sistema y un borde de acento', () => {
    mostrar();
    expect(screen.getByRole('status')).toHaveClass('bg-card', 'text-text-primary', 'border-2', 'border-primary');
  });
});

describe('mostrarNotificacionEnVivo', () => {
  it('crea un toast propio sin cierre automático de sonner (lo maneja el componente)', () => {
    mostrarNotificacionEnVivo({ titulo: 'Tarea asignada', mensaje: 'x' });

    expect(sonner.custom).toHaveBeenCalledWith(expect.any(Function), { duration: Infinity });
    const renderToast = sonner.custom.mock.calls[0][0] as (id: string) => ReturnType<typeof createElement>;
    render(renderToast('n-2'));
    expect(screen.getByRole('status')).toHaveTextContent('Tarea asignada');
  });
});
