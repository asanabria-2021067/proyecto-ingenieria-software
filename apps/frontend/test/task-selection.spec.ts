import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { podarSeleccion, rangoEntre, textoTareas } from '../lib/tasks/selection';
import { useTaskSelection } from '../hooks/use-task-selection';

describe('rangoEntre (HU-202/T-382)', () => {
  const orden = [10, 20, 30, 40, 50];

  it('devuelve el tramo entre ancla y objetivo, en ambos sentidos', () => {
    expect(rangoEntre(orden, 20, 40)).toEqual([20, 30, 40]);
    expect(rangoEntre(orden, 40, 20)).toEqual([20, 30, 40]);
    expect(rangoEntre(orden, 30, 30)).toEqual([30]);
  });

  it('sin ancla u objetivo en el grupo no hay rango', () => {
    expect(rangoEntre(orden, 99, 20)).toBeNull();
    expect(rangoEntre(orden, 20, 99)).toBeNull();
  });
});

describe('podarSeleccion y textoTareas', () => {
  it('quita los ids que ya no se ven y conserva la referencia si no cambia nada', () => {
    const seleccion = new Set([1, 2, 3]);
    expect([...podarSeleccion(seleccion, [1, 3, 4])]).toEqual([1, 3]);
    expect(podarSeleccion(seleccion, [1, 2, 3, 4])).toBe(seleccion);
  });

  it('pluraliza el conteo', () => {
    expect(textoTareas(1)).toBe('1 tarea');
    expect(textoTareas(3)).toBe('3 tareas');
  });
});

describe('useTaskSelection', () => {
  afterEach(() => cleanup());

  it('clic alterna una tarea', () => {
    const { result } = renderHook(() => useTaskSelection([1, 2, 3]));
    act(() => result.current.alternar(2));
    expect([...result.current.seleccionadas]).toEqual([2]);
    expect(result.current.control.activa).toBe(true);
    act(() => result.current.alternar(2));
    expect(result.current.cantidad).toBe(0);
  });

  it('Shift+clic marca el rango desde la última marcada dentro del mismo grupo', () => {
    const { result } = renderHook(() => useTaskSelection([1, 2, 3, 4, 5]));
    const columna = [1, 2, 3, 4];
    act(() => result.current.alternar(1, { orden: columna }));
    act(() => result.current.alternar(4, { rango: true, orden: columna }));
    expect([...result.current.seleccionadas].sort()).toEqual([1, 2, 3, 4]);
  });

  it('Shift+clic en otro grupo solo alterna la tarjeta pulsada', () => {
    const { result } = renderHook(() => useTaskSelection([1, 2, 3, 4, 5]));
    act(() => result.current.alternar(1, { orden: [1, 2] }));
    act(() => result.current.alternar(5, { rango: true, orden: [5] }));
    expect([...result.current.seleccionadas].sort()).toEqual([1, 5]);
  });

  it('desmarca las tareas que dejan de verse al cambiar los filtros', () => {
    const { result, rerender } = renderHook(({ visibles }) => useTaskSelection(visibles), {
      initialProps: { visibles: [1, 2, 3] },
    });
    act(() => result.current.seleccionarVarias([1, 2, 3]));
    rerender({ visibles: [1, 3] });
    expect([...result.current.seleccionadas]).toEqual([1, 3]);
  });

  it('Esc limpia la selección, salvo que haya un diálogo abierto', () => {
    const { result } = renderHook(() => useTaskSelection([1, 2]));
    act(() => result.current.seleccionarVarias([1, 2]));

    const dialogo = document.createElement('div');
    dialogo.setAttribute('role', 'dialog');
    document.body.appendChild(dialogo);
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(result.current.cantidad).toBe(2);

    dialogo.remove();
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(result.current.cantidad).toBe(0);
  });

  it('deseleccionarVarias y limpiar', () => {
    const { result } = renderHook(() => useTaskSelection([1, 2, 3]));
    act(() => result.current.seleccionarVarias([1, 2, 3]));
    act(() => result.current.deseleccionarVarias([2]));
    expect([...result.current.seleccionadas]).toEqual([1, 3]);
    act(() => result.current.limpiar());
    expect(result.current.cantidad).toBe(0);
  });
});
