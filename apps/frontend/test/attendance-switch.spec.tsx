import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn() }),
}));

import { toast } from 'sonner';
import { AttendanceSwitch } from '../components/projects/attendance/attendance-switch';
import type { IntegranteAsistencia } from '../lib/types/attendance';

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
});

function integrante(overrides: Partial<IntegranteAsistencia> = {}): IntegranteAsistencia {
  return {
    idUsuario: 10,
    nombre: 'Ana',
    apellido: 'Pérez',
    fotoUrl: null,
    asistio: false,
    confirmadoEn: null,
    ...overrides,
  };
}

function mutationStub(overrides: Record<string, unknown> = {}) {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
    variables: undefined,
    ...overrides,
  };
}

describe('AttendanceSwitch', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('refleja el estado de asistio recibido', () => {
    const marcarAsistencia = mutationStub();
    render(
      createElement(AttendanceSwitch, { idActividad: 3, integrante: integrante({ asistio: true }), marcarAsistencia: marcarAsistencia as any }),
    );
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('al activarlo llama a la mutación con idActividad/idUsuario/asistio:true (optimista: el caller actualiza la caché antes de que esto resuelva)', () => {
    const marcarAsistencia = mutationStub();
    render(
      createElement(AttendanceSwitch, { idActividad: 3, integrante: integrante({ asistio: false }), marcarAsistencia: marcarAsistencia as any }),
    );

    fireEvent.click(screen.getByRole('switch'));

    expect(marcarAsistencia.mutate).toHaveBeenCalledWith(
      { idActividad: 3, idUsuario: 10, input: { asistio: true } },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it('reversión: si la mutación falla, avisa con un toast de error', () => {
    const marcarAsistencia = mutationStub({
      mutate: vi.fn((_vars, options) => {
        options?.onError?.(Object.assign(new Error('no eres el líder'), { statusCode: 403 }));
      }),
    });
    render(
      createElement(AttendanceSwitch, { idActividad: 3, integrante: integrante({ asistio: false }), marcarAsistencia: marcarAsistencia as any }),
    );

    fireEvent.click(screen.getByRole('switch'));

    expect(toast.error).toHaveBeenCalledWith(
      'No se pudo actualizar la asistencia',
      expect.objectContaining({ description: expect.any(String) }),
    );
  });

  it('se deshabilita mientras la mutación está pendiente', () => {
    const marcarAsistencia = mutationStub({ isPending: true });
    render(
      createElement(AttendanceSwitch, { idActividad: 3, integrante: integrante(), marcarAsistencia: marcarAsistencia as any }),
    );
    expect(screen.getByRole('switch')).toBeDisabled();
  });
});
