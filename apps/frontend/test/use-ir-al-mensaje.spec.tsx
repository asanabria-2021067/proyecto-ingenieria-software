import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useIrAlMensaje } from '../hooks/use-ir-al-mensaje';
import type { ChatMensaje } from '../lib/types/chat';

const usuario = { idUsuario: 1, nombre: 'Ana', apellido: 'Paz', fotoUrl: null };
const msg = (idMensaje: number): ChatMensaje => ({
  idMensaje,
  idConversacion: 5,
  contenido: `m${idMensaje}`,
  enviadoEn: '2026-10-16T10:00:00Z',
  remitente: usuario,
});

function lista(ids: number[]) {
  const el = document.createElement('div');
  for (const id of ids) {
    const m = document.createElement('div');
    m.dataset.mensajeId = String(id);
    m.tabIndex = -1;
    m.scrollIntoView = vi.fn();
    el.appendChild(m);
  }
  document.body.appendChild(el);
  return { current: el };
}

function reducedMotion(value: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: value }) as unknown as typeof window.matchMedia;
}

describe('useIrAlMensaje', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    reducedMotion(false);
  });
  afterEach(() => vi.useRealTimers());

  it('si el mensaje ya esta en la lista: hace scroll suave, lo enfoca y lo resalta brevemente', async () => {
    const listRef = lista([1, 2]);
    const cargarAnteriores = vi.fn();
    const { result } = renderHook(() =>
      useIrAlMensaje({ listRef, messages: [msg(1), msg(2)], cargarAnteriores, onNoDisponible: vi.fn() }),
    );

    await act(() => result.current.irAlMensaje(1));

    const el = listRef.current.querySelector<HTMLElement>('[data-mensaje-id="1"]')!;
    expect(el.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
    expect(document.activeElement).toBe(el);
    expect(el.dataset.resaltado).toBe('true');
    expect(cargarAnteriores).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(2000));
    expect(el.dataset.resaltado).toBeUndefined();
  });

  it('con prefers-reduced-motion hace scroll sin animacion', async () => {
    reducedMotion(true);
    const listRef = lista([1]);
    const { result } = renderHook(() =>
      useIrAlMensaje({ listRef, messages: [msg(1)], cargarAnteriores: vi.fn(), onNoDisponible: vi.fn() }),
    );

    await act(() => result.current.irAlMensaje(1));

    const el = listRef.current.querySelector<HTMLElement>('[data-mensaje-id="1"]')!;
    expect(el.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'auto' });
  });

  it('si no esta cargado, pagina hacia atras hasta encontrarlo y entonces hace scroll', async () => {
    const listRef = lista([10]);
    const cargarAnteriores = vi
      .fn<() => Promise<ChatMensaje[]>>()
      .mockResolvedValueOnce([msg(8), msg(9)])
      .mockResolvedValueOnce([msg(5), msg(6)]);
    const onNoDisponible = vi.fn();
    const { result, rerender } = renderHook(
      ({ messages }) => useIrAlMensaje({ listRef, messages, cargarAnteriores, onNoDisponible }),
      { initialProps: { messages: [msg(10)] } },
    );

    await act(() => result.current.irAlMensaje(5));
    expect(cargarAnteriores).toHaveBeenCalledTimes(2);

    // El mensaje aparece en el DOM en el render siguiente a la carga.
    const el = document.createElement('div');
    el.dataset.mensajeId = '5';
    el.scrollIntoView = vi.fn();
    listRef.current.appendChild(el);
    rerender({ messages: [msg(5), msg(6), msg(8), msg(9), msg(10)] });

    expect(el.scrollIntoView).toHaveBeenCalled();
    expect(onNoDisponible).not.toHaveBeenCalled();
  });

  it('si se agotan las paginas sin encontrarlo, avisa que no esta disponible', async () => {
    const listRef = lista([10]);
    const cargarAnteriores = vi
      .fn<() => Promise<ChatMensaje[]>>()
      .mockResolvedValueOnce([msg(9)])
      .mockResolvedValueOnce([]);
    const onNoDisponible = vi.fn();
    const { result } = renderHook(() =>
      useIrAlMensaje({ listRef, messages: [msg(10)], cargarAnteriores, onNoDisponible }),
    );

    await act(() => result.current.irAlMensaje(1));

    expect(cargarAnteriores).toHaveBeenCalledTimes(2);
    expect(onNoDisponible).toHaveBeenCalledTimes(1);
  });
});
