import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

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
    abierto: false,
    origen: 'GRANULAR',
    reportadas: '7.00',
    estimacionTarea: null,
    exceso: '0.00',
    justificacionExceso: null,
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

    fireEvent.click(screen.getByRole('button', { name: /^Ajustar/ }));
    fireEvent.change(screen.getByLabelText('Horas aceptadas'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText(/Justificación del líder/), { target: { value: 'Se descontaron 2 horas' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar ajuste/ }));

    expect(onUpsert).toHaveBeenCalledWith(300, {
      deltaHoras: '-2.00',
      justificacion: 'Se descontaron 2 horas',
    });
  });

  it('exige justificación con delta ≠ 0 y no llama a onUpsert sin ella', () => {
    const { onUpsert } = renderRow();

    fireEvent.click(screen.getByRole('button', { name: /^Ajustar/ }));
    fireEvent.change(screen.getByLabelText('Horas aceptadas'), { target: { value: '9' } });
    const boton = screen.getByRole('button', { name: /Guardar ajuste/ });
    expect(boton).toBeDisabled();
    expect(screen.getByLabelText(/Justificación del líder/)).toBeRequired();
    expect(onUpsert).not.toHaveBeenCalled();
  });

  it('NO exige justificación con delta 0 (volver a lo reportado) y no la envía', () => {
    const { onUpsert } = renderRow({
      tramo: tramo({ ajuste: '-2.00', propuestas: '5.00', justificacionAjuste: 'Antes' }),
    });

    fireEvent.click(screen.getByRole('button', { name: /Editar ajuste/ }));
    fireEvent.change(screen.getByLabelText('Horas aceptadas'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText(/Justificación del líder/), { target: { value: '' } });
    expect(screen.getByLabelText(/Justificación del líder/)).not.toBeRequired();
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

  it('sin ajuste vigente no se ofrece «Revertir»: no hay nada que deshacer', () => {
    renderRow();
    expect(screen.queryByRole('button', { name: /^Revertir/ })).not.toBeInTheDocument();
  });

  it('un tramo ABIERTO (el integrante no lo ha cerrado) es read-only: el backend solo ajusta tramos cerrados', () => {
    renderRow({ tramo: tramo({ abierto: true, propuestas: '7.00' }) });

    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.getByText('Abierto · pendiente de cierre')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Ajustar/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /^Revertir/ })).not.toBeInTheDocument();
  });

  it('un tramo cerrado y ya acreditado (reconocidoEn) es read-only', () => {
    renderRow({ tramo: tramo({ abierto: false, reconocidoEn: '2026-09-01T12:00:00.000Z' }) });

    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.getByText('Acreditado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Ajustar/ })).toBeDisabled();
  });

  it('un tramo cerrado sin participación resuelta es read-only', () => {
    renderRow({ tramo: tramo({ abierto: false, idParticipacion: null }) });

    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Ajustar/ })).toBeDisabled();
  });

  it('un tramo cerrado, con participación y sin acreditar es el ÚNICO editable', () => {
    renderRow({ tramo: tramo({ abierto: false, idParticipacion: 51, reconocidoEn: null }) });

    expect(screen.getByRole('button', { name: /^Ajustar/ })).toBeEnabled();
    expect(screen.getByText('Tramo cerrado')).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: /^Ajustar/ }));
    expect(screen.getByText('0/5000')).toBeInTheDocument();
    expect(screen.getByLabelText(/Justificación/)).toHaveAttribute('maxlength', '5000');
  });
});

/**
 * El líder no reescribe el registro del estudiante: lo lee y, si procede,
 * propone un ajuste aparte. Antes la fila abría de entrada un input con las
 * horas del estudiante ya cargadas, que se leía como editar su registro.
 */
describe('HourAdjustmentRow — leer primero, ajustar después', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('de entrada muestra lo reportado y no ofrece guardar nada', () => {
    renderRow({ tramo: tramo({ reportadas: '7.00', exceso: '2.00', estimacionTarea: 5, justificacionExceso: 'Hubo retrabajo' }) });

    expect(screen.getByText('Horas reportadas')).toBeInTheDocument();
    expect(screen.getByText('2 h')).toBeInTheDocument();
    expect(screen.getByText('Hubo retrabajo')).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Guardar ajuste/ })).not.toBeInTheDocument();
  });

  it('«Ajustar» revela horas aceptadas y justificación del líder, y entonces sí aparece «Guardar ajuste»', () => {
    renderRow();

    fireEvent.click(screen.getByRole('button', { name: /^Ajustar/ }));

    expect(screen.getByLabelText('Horas aceptadas')).toBeInTheDocument();
    expect(screen.getByLabelText(/Justificación del líder/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Guardar ajuste/ })).toBeInTheDocument();
  });

  it('«Cancelar» cierra el panel y descarta lo escrito, sin llamar a onUpsert', () => {
    const { onUpsert } = renderRow();

    fireEvent.click(screen.getByRole('button', { name: /^Ajustar/ }));
    fireEvent.change(screen.getByLabelText('Horas aceptadas'), { target: { value: '99' } });
    fireEvent.click(screen.getByRole('button', { name: /Cancelar ajuste/ }));

    expect(screen.queryByLabelText('Horas aceptadas')).not.toBeInTheDocument();
    expect(onUpsert).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /^Ajustar/ }));
    expect(screen.getByLabelText('Horas aceptadas')).toHaveValue(7);
  });

  it('sin sobreestimación, exceso y justificación dicen «No aplica» en vez de fingir un cero', () => {
    renderRow({ tramo: tramo({ reportadas: '4.00', exceso: '0.00', estimacionTarea: 8, justificacionExceso: null }) });

    const noAplica = screen.getAllByText('No aplica');
    // Exceso, justificación del estudiante y —sin ajuste— horas aceptadas y justificación del líder.
    expect(noAplica.length).toBeGreaterThanOrEqual(3);
  });

  it('«Horas totales hechas» es el neto: lo reportado cuando no hay ajuste, lo aceptado cuando lo hay', () => {
    const { unmount } = renderRow({ tramo: tramo({ reportadas: '7.00', propuestas: '7.00' }) });
    const sinAjuste = screen.getByText('Horas totales hechas').closest('div') as HTMLElement;
    expect(within(sinAjuste).getByText('7 h')).toBeInTheDocument();
    unmount();

    renderRow({ tramo: tramo({ reportadas: '7.00', ajuste: '-2.00', propuestas: '5.00', justificacionAjuste: 'Se descontó' }) });
    const conAjuste = screen.getByText('Horas totales hechas').closest('div') as HTMLElement;
    expect(within(conAjuste).getByText('5 h')).toBeInTheDocument();
    // Y lo aceptado por el líder queda visible junto a su justificación.
    const aceptadas = screen.getByText('Horas aceptadas').closest('div') as HTMLElement;
    expect(within(aceptadas).getByText('5 h')).toBeInTheDocument();
    expect(screen.getByText('Se descontó')).toBeInTheDocument();
  });

  it('con un ajuste vigente el botón invita a editarlo, con el mismo nombre que se ve', () => {
    renderRow({ tramo: tramo({ ajuste: '-2.00', propuestas: '5.00', justificacionAjuste: 'Previo' }) });

    const boton = screen.getByRole('button', { name: /Editar ajuste/ });
    expect(boton).toHaveTextContent('Editar ajuste');
  });
});
