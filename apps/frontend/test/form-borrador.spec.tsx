import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import {
  descartarBorrador,
  descartarTodosLosBorradores,
  guardarBorrador,
  leerBorrador,
} from '../lib/forms/borrador';
const usuarioMock = vi.hoisted(() => ({ actual: { idUsuario: 1 } as { idUsuario: number } | undefined }));
vi.mock('../hooks/use-current-user', () => ({ useCurrentUser: () => ({ data: usuarioMock.actual }) }));
import { useFormDraft } from '../hooks/use-form-draft';
import { FormStepper } from '../components/ui/form-stepper';
import { caracteresFaltantes, JUSTIFICACION_MIN } from '../lib/forms/postulacion';

beforeEach(() => {
  localStorage.clear();
  usuarioMock.actual = { idUsuario: 1 };
});
afterEach(() => cleanup());

describe('lib/forms/borrador', () => {
  it('guarda y lee un borrador', () => {
    guardarBorrador('a', { titulo: 'x' }, 1000);
    expect(leerBorrador<{ titulo: string }>('a', 2000)).toEqual({ valor: { titulo: 'x' }, guardadoEn: 1000 });
  });

  it('un borrador de más de 7 días caduca y se elimina', () => {
    guardarBorrador('a', 1, 0);
    expect(leerBorrador('a', 8 * 24 * 60 * 60 * 1000)).toBeNull();
    expect(localStorage.getItem('uvg-borrador:a')).toBeNull();
  });

  it('un valor corrupto se ignora sin lanzar', () => {
    localStorage.setItem('uvg-borrador:a', '{no es json');
    expect(leerBorrador('a')).toBeNull();
  });

  it('si el almacenamiento falla, no lanza', () => {
    const espia = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('cuota');
    });
    expect(() => guardarBorrador('a', 1)).not.toThrow();
    espia.mockRestore();
  });

  it('descartarTodosLosBorradores solo borra los de este módulo', () => {
    guardarBorrador('a', 1);
    guardarBorrador('b', 2);
    localStorage.setItem('otra-cosa', 'x');
    descartarTodosLosBorradores();
    expect(leerBorrador('a')).toBeNull();
    expect(leerBorrador('b')).toBeNull();
    expect(localStorage.getItem('otra-cosa')).toBe('x');
    descartarBorrador('a');
  });
});

describe('useFormDraft', () => {
  const opciones = (valor: { t: string }, extra: Record<string, unknown> = {}) => ({
    clave: 'k',
    valor,
    alRestaurar: vi.fn(),
    alDescartar: vi.fn(),
    ...extra,
  });

  it('guarda tras un cambio y no guarda el estado inicial', async () => {
    const { rerender } = renderHook((o) => useFormDraft(o), { initialProps: opciones({ t: '' }) });
    await new Promise((r) => setTimeout(r, 500));
    expect(localStorage.getItem('uvg-borrador:1-k')).toBeNull();

    rerender(opciones({ t: 'hola' }));
    await waitFor(() => expect(leerBorrador<{ t: string }>('1-k')?.valor).toEqual({ t: 'hola' }));
  });

  it('restaura un borrador existente al montar y lo marca como restaurado', () => {
    guardarBorrador('1-k', { t: 'guardado' });
    const alRestaurar = vi.fn();
    const { result } = renderHook(() => useFormDraft(opciones({ t: '' }, { alRestaurar })));
    expect(alRestaurar).toHaveBeenCalledWith({ t: 'guardado' });
    expect(result.current.restaurado).toBe(true);
  });

  it('descartar borra el borrador y devuelve el formulario a su estado inicial', () => {
    guardarBorrador('1-k', { t: 'guardado' });
    const alDescartar = vi.fn();
    const { result } = renderHook(() => useFormDraft(opciones({ t: '' }, { alDescartar })));
    act(() => result.current.descartar());
    expect(alDescartar).toHaveBeenCalledTimes(1);
    expect(result.current.restaurado).toBe(false);
    expect(leerBorrador('1-k')).toBeNull();
  });

  it('limpiar borra el borrador y no se vuelve a guardar aunque el formulario cambie', async () => {
    const { result, rerender } = renderHook((o) => useFormDraft(o), { initialProps: opciones({ t: '' }) });
    rerender(opciones({ t: 'enviado' }));
    act(() => result.current.limpiar());
    rerender(opciones({ t: 'enviado y editado' }));
    await new Promise((r) => setTimeout(r, 600));
    expect(leerBorrador('1-k')).toBeNull();
  });

  it('sin clave el borrador está desactivado', async () => {
    const { rerender } = renderHook((o) => useFormDraft(o), { initialProps: opciones({ t: '' }, { clave: null }) });
    rerender(opciones({ t: 'x' }, { clave: null }));
    await new Promise((r) => setTimeout(r, 600));
    expect(localStorage.length).toBe(0);
  });
});

describe('useFormDraft por cuenta', () => {
  it('otra cuenta no ve el borrador de la anterior, y sin usuario no hay borrador', () => {
    guardarBorrador('1-k', { t: 'de la cuenta 1' });
    const alRestaurar = vi.fn();
    usuarioMock.actual = { idUsuario: 2 };
    renderHook(() => useFormDraft({ clave: 'k', valor: { t: '' }, alRestaurar, alDescartar: vi.fn() }));
    usuarioMock.actual = undefined;
    renderHook(() => useFormDraft({ clave: 'k', valor: { t: '' }, alRestaurar, alDescartar: vi.fn() }));
    expect(alRestaurar).not.toHaveBeenCalled();
  });
});

describe('FormStepper', () => {
  it('marca el paso actual y llama a onSeleccionar', () => {
    const onSeleccionar = vi.fn();
    render(createElement(FormStepper, { pasos: ['Uno', 'Dos', 'Tres'], actual: 1, onSeleccionar }));
    expect(screen.getByRole('button', { name: 'Paso 2 de 3: Dos' })).toHaveAttribute('aria-current', 'step');
    fireEvent.click(screen.getByRole('button', { name: 'Paso 3 de 3: Tres' }));
    expect(onSeleccionar).toHaveBeenCalledWith(2);
  });

  it('sin onSeleccionar es solo informativo', () => {
    render(createElement(FormStepper, { pasos: ['Uno', 'Dos'], actual: 0 }));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});

describe('caracteresFaltantes', () => {
  it('cuenta lo que falta para el mínimo de 40', () => {
    expect(JUSTIFICACION_MIN).toBe(40);
    expect(caracteresFaltantes('')).toBe(40);
    expect(caracteresFaltantes('x'.repeat(39))).toBe(1);
    expect(caracteresFaltantes('x'.repeat(40))).toBe(0);
    expect(caracteresFaltantes('x'.repeat(500))).toBe(0);
  });
});
