import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

beforeAll(() => {
  (globalThis as any).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const guardarMutate = vi.fn();
const estado = vi.hoisted(() => ({
  preferencia: null as null | Record<string, unknown>,
}));
vi.mock('@/hooks/use-chat', () => ({
  useNoMolestar: () => ({ preferencia: estado.preferencia, isLoading: false }),
  useUpdateNoMolestar: () => ({ mutate: guardarMutate, isPending: false }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { NoMolestarDialog } from '../components/chat-dock/no-molestar-dialog';

function abrir(onOpenChange = vi.fn()) {
  render(createElement(NoMolestarDialog, { open: true, onOpenChange }));
  return onOpenChange;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  estado.preferencia = null;
});

describe('NoMolestarDialog', () => {
  it('sin preferencia guardada muestra los valores por defecto', () => {
    abrir();
    expect(screen.getByLabelText('Activar no molestar')).not.toBeChecked();
    expect(screen.getByLabelText('Desde')).toHaveValue('22:00');
    expect(screen.getByLabelText('Hasta')).toHaveValue('07:00');
    expect(screen.getByLabelText('Zona horaria')).toHaveValue('America/Guatemala');
    expect(screen.getByLabelText('Lunes')).toBeChecked();
  });

  it('guarda lo que el usuario configura', () => {
    abrir();
    fireEvent.click(screen.getByLabelText('Activar no molestar'));
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '21:30' } });
    fireEvent.click(screen.getByLabelText('Domingo'));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(guardarMutate).toHaveBeenCalledWith(
      { activo: true, horaInicio: '21:30', horaFin: '07:00', diasSemana: [1, 2, 3, 4, 5, 6], zona: 'America/Guatemala' },
      expect.any(Object),
    );
  });

  it('carga la preferencia guardada, incluida una zona fuera de la lista', () => {
    estado.preferencia = { activo: true, horaInicio: '20:00', horaFin: '06:00', diasSemana: [1], zona: 'Asia/Tokyo' };
    abrir();
    expect(screen.getByLabelText('Activar no molestar')).toBeChecked();
    expect(screen.getByLabelText('Zona horaria')).toHaveValue('Asia/Tokyo');
    expect(screen.getByLabelText('Martes')).not.toBeChecked();
  });

  it('con inicio igual a fin avisa y bloquea el guardado', () => {
    abrir();
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '22:00' } });

    expect(screen.getByRole('alert')).toHaveTextContent('distintas');
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
  });

  it('Cancelar cierra sin guardar', () => {
    const onOpenChange = abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(guardarMutate).not.toHaveBeenCalled();
  });
});
