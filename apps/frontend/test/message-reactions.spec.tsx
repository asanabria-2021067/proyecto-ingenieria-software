import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MessageReactions } from '../components/chat-dock/message-reactions';
import { alternarReaccionLocal, EMOJIS_REACCION, reaccionesDesdeSocket } from '../lib/chat-reacciones';

const THUMB = EMOJIS_REACCION[0];
const HEART = EMOJIS_REACCION[1];

beforeAll(() => {
  if (typeof (globalThis as any).ResizeObserver === 'undefined') {
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

afterEach(cleanup);

function renderReactions(reacciones = [{ emoji: THUMB, count: 2, reaccionadoPorMi: true }, { emoji: HEART, count: 1, reaccionadoPorMi: false }]) {
  const onToggle = vi.fn();
  render(createElement(MessageReactions, { reacciones, onToggle }));
  return onToggle;
}

describe('MessageReactions', () => {
  it('muestra un chip por emoji con su conteo y el estado "mi reaccion" via aria-pressed', () => {
    renderReactions();

    const mio = screen.getByRole('button', { name: /2 reacciones, incluyes la tuya/ });
    const otro = screen.getByRole('button', { name: /1 reacción$/ });
    expect(mio).toHaveAttribute('aria-pressed', 'true');
    expect(mio).toHaveTextContent('2');
    expect(otro).toHaveAttribute('aria-pressed', 'false');
  });

  it('al pulsar un chip alterna esa reaccion', () => {
    const onToggle = renderReactions();

    fireEvent.click(screen.getByRole('button', { name: /1 reacción$/ }));

    expect(onToggle).toHaveBeenCalledWith(HEART);
  });

  it('sin reacciones solo muestra el boton para reaccionar', () => {
    renderReactions([]);

    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Reaccionar al mensaje' })).toBeInTheDocument();
  });

  it('el selector abre con el teclado, elige un emoji y se cierra', async () => {
    const onToggle = renderReactions([]);

    const abrir = screen.getByRole('button', { name: 'Reaccionar al mensaje' });
    fireEvent.keyDown(abrir, { key: 'Enter' });
    fireEvent.click(abrir);

    const opciones = await screen.findAllByRole('button', { name: /^Reaccionar con / });
    expect(opciones).toHaveLength(EMOJIS_REACCION.length);

    fireEvent.click(opciones[2]);

    expect(onToggle).toHaveBeenCalledWith(EMOJIS_REACCION[2]);
    expect(screen.queryByRole('group', { name: 'Elegir reacción' })).not.toBeInTheDocument();
  });

  it('las flechas mueven el foco entre emojis del selector', async () => {
    renderReactions([]);
    fireEvent.click(screen.getByRole('button', { name: 'Reaccionar al mensaje' }));

    const opciones = await screen.findAllByRole('button', { name: /^Reaccionar con / });
    opciones[0].focus();
    fireEvent.keyDown(opciones[0], { key: 'ArrowRight' });
    expect(opciones[1]).toHaveFocus();

    fireEvent.keyDown(opciones[1], { key: 'ArrowLeft' });
    fireEvent.keyDown(opciones[0], { key: 'ArrowLeft' });
    expect(opciones[opciones.length - 1]).toHaveFocus();

    fireEvent.keyDown(opciones[opciones.length - 1], { key: 'a' });
    expect(opciones[opciones.length - 1]).toHaveFocus();
  });
});

describe('alternarReaccionLocal', () => {
  it('agrega la primera reaccion de un emoji nuevo como propia', () => {
    expect(alternarReaccionLocal(undefined, THUMB)).toEqual([{ emoji: THUMB, count: 1, reaccionadoPorMi: true }]);
  });

  it('suma la propia a un emoji que ya tenian otros', () => {
    expect(alternarReaccionLocal([{ emoji: THUMB, count: 2, reaccionadoPorMi: false }], THUMB)).toEqual([
      { emoji: THUMB, count: 3, reaccionadoPorMi: true },
    ]);
  });

  it('quita la propia y deja el conteo de los demas', () => {
    expect(alternarReaccionLocal([{ emoji: THUMB, count: 2, reaccionadoPorMi: true }], THUMB)).toEqual([
      { emoji: THUMB, count: 1, reaccionadoPorMi: false },
    ]);
  });

  it('elimina el chip cuando era la unica reaccion', () => {
    expect(alternarReaccionLocal([{ emoji: THUMB, count: 1, reaccionadoPorMi: true }], THUMB)).toEqual([]);
  });
});

describe('reaccionesDesdeSocket', () => {
  const grupos = [{ emoji: THUMB, count: 2, idsUsuarios: [1, 2] }, { emoji: HEART, count: 1, idsUsuarios: [2] }];

  it('deriva reaccionadoPorMi con el id del usuario actual', () => {
    expect(reaccionesDesdeSocket(grupos, 1).map((r) => r.reaccionadoPorMi)).toEqual([true, false]);
  });

  it('sin usuario actual conocido, ninguna es propia', () => {
    expect(reaccionesDesdeSocket(grupos).every((r) => !r.reaccionadoPorMi)).toBe(true);
  });
});
