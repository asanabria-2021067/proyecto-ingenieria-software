import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

if (typeof (globalThis as any).ResizeObserver === 'undefined') {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

import { HourAdjustmentRow, formatearSigno } from '../components/hours/hour-adjustment-row';
import { isDeltaCero, toDeltaHoras } from '../hooks/use-hour-adjustments';
import type { SprintClosingTramoDto } from '../lib/types/sprints';

function tramo(overrides: Partial<SprintClosingTramoDto> = {}): SprintClosingTramoDto {
  return {
    idAsignacion: 300,
    idTarea: 12,
    tituloTarea: 'Coordinación de jornada universitaria',
    tareaEliminada: false,
    idParticipacion: 51,
    abierto: true,
    origen: 'GRANULAR',
    reportadas: '7.00',
    ajuste: null,
    justificacionAjuste: null,
    propuestas: '7.00',
    reconocidoEn: null,
    ...overrides,
  };
}

function renderRow(props: Record<string, unknown> = {}) {
  const onUpsert = vi.fn();
  const onRevert = vi.fn();
  const onLoadHistory = vi.fn().mockResolvedValue([]);
  const utils = render(
    createElement(HourAdjustmentRow, {
      tramo: tramo(),
      indice: 1,
      onUpsert,
      onRevert,
      onLoadHistory,
      ...props,
    }),
  );
  return { ...utils, onUpsert, onRevert, onLoadHistory };
}

describe('toDeltaHoras — absoluto → delta con signo y 2 decimales', () => {
  it('convierte propuestas − reportadas conservando el signo', () => {
    expect(toDeltaHoras(5, '7.00')).toBe('-2.00');
    expect(toDeltaHoras(9, '7.00')).toBe('2.00');
    expect(toDeltaHoras(7, '7.00')).toBe('0.00');
    expect(toDeltaHoras(7.1, '7.00')).toBe('0.10');
    expect(toDeltaHoras(0.3, '0.10')).toBe('0.20'); // sin cola binaria
    expect(toDeltaHoras(0, '12.50')).toBe('-12.50');
  });

  it('isDeltaCero reconoce cero con cualquier forma', () => {
    expect(isDeltaCero('0.00')).toBe(true);
    expect(isDeltaCero('-0.00')).toBe(true);
    expect(isDeltaCero('0.01')).toBe(false);
  });

  it('formatearSigno muestra + / − y sin ceros de cola', () => {
    expect(formatearSigno('2.00')).toBe('+2');
    expect(formatearSigno('-2.50')).toBe('-2.5');
    expect(formatearSigno('0.00')).toBe('0.00');
  });
});

describe('HourAdjustmentRow (VIEW-03 / F002)', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('envía deltaHoras con signo y 2 decimales a partir del absoluto escrito', () => {
    const { onUpsert } = renderRow();

    fireEvent.change(screen.getByLabelText('Horas propuestas'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText(/Justificación/), { target: { value: 'Se descontaron 2 horas' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar ajuste/ }));

    expect(onUpsert).toHaveBeenCalledWith(300, {
      deltaHoras: '-2.00',
      justificacion: 'Se descontaron 2 horas',
    });
  });

  it('exige justificación con delta ≠ 0 y no llama a onUpsert sin ella', () => {
    const { onUpsert } = renderRow();

    fireEvent.change(screen.getByLabelText('Horas propuestas'), { target: { value: '9' } });
    const boton = screen.getByRole('button', { name: /Guardar ajuste/ });
    expect(boton).toBeDisabled();
    expect(screen.getByLabelText(/Justificación/)).toBeRequired();
    expect(onUpsert).not.toHaveBeenCalled();
  });

  it('NO exige justificación con delta 0 (volver a lo reportado) y no la envía', () => {
    const { onUpsert } = renderRow({
      tramo: tramo({ ajuste: '-2.00', propuestas: '5.00', justificacionAjuste: 'Antes' }),
    });

    fireEvent.change(screen.getByLabelText('Horas propuestas'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText(/Justificación/), { target: { value: '' } });
    expect(screen.getByLabelText(/Justificación/)).not.toBeRequired();
    fireEvent.click(screen.getByRole('button', { name: /Guardar ajuste/ }));

    expect(onUpsert).toHaveBeenCalledWith(300, { deltaHoras: '0.00' });
  });

  it('«Revertir» llama a onRevert (DELETE) cuando hay ajuste vigente', () => {
    const { onRevert } = renderRow({
      tramo: tramo({ ajuste: '-2.00', propuestas: '5.00', justificacionAjuste: 'Ajuste previo' }),
    });

    fireEvent.click(screen.getByRole('button', { name: /^Revertir/ }));
    expect(onRevert).toHaveBeenCalledWith(300);
  });

  it('sin ajuste vigente, «Revertir» está deshabilitado con tooltip', () => {
    renderRow();
    const revertir = screen.getByRole('button', { name: /^Revertir/ });
    expect(revertir).toBeDisabled();
    expect((revertir.parentElement as HTMLElement).getAttribute('tabindex')).toBe('0');
  });

  it('un tramo abierto:false se renderiza read-only (sin input ni acciones habilitadas)', () => {
    renderRow({ tramo: tramo({ abierto: false, propuestas: '7.00' }) });

    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.getByText('Consolidado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Guardar ajuste/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /^Revertir/ })).not.toBeInTheDocument();
  });

  it('«Ver historial» carga la cadena bajo demanda y la muestra', async () => {
    const onLoadHistory = vi.fn().mockResolvedValue([
      {
        idAjusteHora: 1,
        idAsignacion: 300,
        deltaHoras: '-2.00',
        horasBase: '7.00',
        propuesta: '5.00',
        justificacion: 'Se descontaron 2 horas',
        idAutor: 1,
        creadoEn: '2026-08-20T12:00:00.000Z',
        anuladoEn: null,
        anuladoPor: null,
        idAjusteAnterior: null,
        vigente: true,
      },
    ]);
    renderRow({ onLoadHistory });

    fireEvent.click(screen.getByRole('button', { name: /Ver historial/ }));
    await waitFor(() => expect(onLoadHistory).toHaveBeenCalledWith(300));
    expect(await screen.findByText('Vigente')).toBeInTheDocument();
    expect(screen.getByText('Se descontaron 2 horas')).toBeInTheDocument();
  });

  it('el contador de justificación admite 5000 caracteres', () => {
    renderRow();
    expect(screen.getByText('0/5000')).toBeInTheDocument();
    expect(screen.getByLabelText(/Justificación/)).toHaveAttribute('maxlength', '5000');
  });
});
