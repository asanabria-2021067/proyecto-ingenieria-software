import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ProjectExportDialog } from '@/components/projects/project-export-dialog';
import { DEFAULT_EXPORT_OPTIONS, type FormatoExport } from '@/lib/export-options';

/**
 * Revisión del PR (HU-164): el diálogo donde el usuario elige tamaño de
 * fuente, color de tablas, qué datos exportar, rango de fechas y gráficas.
 */

beforeAll(() => {
  (window as unknown as { PointerEvent: unknown }).PointerEvent = window.MouseEvent;
});

// "Hoy" fijo para las validaciones de fechas.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 24, 12, 0, 0));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderDialog(
  formato: FormatoExport,
  props: Partial<{ isPending: boolean; fechaCreacionProyecto: string | null }> = {},
) {
  const onConfirm = vi.fn();
  const onOpenChange = vi.fn();
  render(
    createElement(ProjectExportDialog, {
      open: true,
      onOpenChange,
      formato,
      isPending: props.isPending ?? false,
      fechaCreacionProyecto: props.fechaCreacionProyecto ?? null,
      onConfirm,
    }),
  );
  return { onConfirm, onOpenChange };
}

describe('ProjectExportDialog — PDF', () => {
  it('muestra los valores por defecto: fuente mediana, color gris, todos los datos y sin gráficas', () => {
    renderDialog('pdf');

    expect(screen.getByRole('radio', { name: /mediana/i })).toBeChecked();
    expect(screen.getByLabelText('Hexadecimal')).toHaveValue('#464646');
    expect(screen.getByRole('checkbox', { name: /miembros y horas/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /avance por sprint/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /burndown/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /gráfica de barras/i })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /gráfica de pastel/i })).not.toBeChecked();
  });

  it('confirmar sin cambios entrega las opciones por defecto', () => {
    const { onConfirm } = renderDialog('pdf');

    fireEvent.click(screen.getByRole('button', { name: /descargar pdf/i }));

    expect(onConfirm).toHaveBeenCalledWith(DEFAULT_EXPORT_OPTIONS);
  });

  it('entrega lo elegido: fuente, color, secciones, gráficas y fechas', () => {
    const { onConfirm } = renderDialog('pdf');

    fireEvent.click(screen.getByRole('radio', { name: /grande/i }));
    fireEvent.change(screen.getByLabelText('Hexadecimal'), { target: { value: '#1e408c' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /burndown/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /gráfica de barras/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /gráfica de pastel/i }));
    fireEvent.change(screen.getByLabelText(/desde/i), { target: { value: '2026-02-01' } });
    fireEvent.change(screen.getByLabelText(/hasta/i), { target: { value: '2026-02-28' } });
    fireEvent.click(screen.getByRole('button', { name: /descargar pdf/i }));

    expect(onConfirm).toHaveBeenCalledWith({
      fuente: 'grande',
      color: '#1e408c',
      secciones: ['miembros', 'avance'],
      graficas: ['barras', 'pastel'],
      desde: '2026-02-01',
      hasta: '2026-02-28',
    });
  });

  it('sin ningún dato seleccionado avisa y no deja descargar', () => {
    const { onConfirm } = renderDialog('pdf');

    fireEvent.click(screen.getByRole('checkbox', { name: /miembros y horas/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /avance por sprint/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /burndown/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/al menos un dato/i);
    expect(screen.getByRole('button', { name: /descargar pdf/i })).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('las gráficas se deshabilitan (y se descartan) sin la sección de miembros y horas', () => {
    const { onConfirm } = renderDialog('pdf');

    fireEvent.click(screen.getByRole('checkbox', { name: /gráfica de barras/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /miembros y horas/i }));

    expect(screen.getByRole('checkbox', { name: /gráfica de barras/i })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /gráfica de pastel/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /descargar pdf/i }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ graficas: [] }));
  });

  it('un rango con "Desde" posterior a "Hasta" avisa y no deja descargar', () => {
    renderDialog('pdf');

    fireEvent.change(screen.getByLabelText(/desde/i), { target: { value: '2026-03-10' } });
    fireEvent.change(screen.getByLabelText(/hasta/i), { target: { value: '2026-03-01' } });

    expect(screen.getByRole('alert')).toHaveTextContent(/"Desde" no puede ser posterior a la fecha "Hasta"/);
    expect(screen.getByRole('button', { name: /descargar pdf/i })).toBeDisabled();
  });

  it('el selector de color del PDF cambia el color entregado', () => {
    const { onConfirm } = renderDialog('pdf');

    fireEvent.change(screen.getByLabelText('Rojo'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /descargar pdf/i }));

    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ color: '#004646' }));
  });

  it('mientras se genera el archivo el botón queda deshabilitado', () => {
    renderDialog('pdf', { isPending: true });

    expect(screen.getByRole('button', { name: /generando/i })).toBeDisabled();
  });

  it('cancelar cierra el diálogo sin exportar', () => {
    const { onConfirm, onOpenChange } = renderDialog('pdf');

    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('ProjectExportDialog — CSV', () => {
  it('solo ofrece el rango de fechas: sin fuente, color, datos ni gráficas', () => {
    renderDialog('csv');

    expect(screen.getByLabelText(/desde/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/hasta/i)).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('confirmar entrega las opciones con el rango elegido', () => {
    const { onConfirm } = renderDialog('csv');

    fireEvent.change(screen.getByLabelText(/desde/i), { target: { value: '2026-02-01' } });
    fireEvent.click(screen.getByRole('button', { name: /descargar csv/i }));

    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ desde: '2026-02-01', hasta: '' }));
  });
});

describe('ProjectExportDialog — validación de fechas', () => {
  const CREACION = '2026-01-10T15:00:00.000Z';

  it('los campos de fecha limitan el calendario: mínimo = creación del proyecto, máximo = hoy', () => {
    renderDialog('pdf', { fechaCreacionProyecto: CREACION });

    for (const nombre of [/desde/i, /hasta/i]) {
      expect(screen.getByLabelText(nombre)).toHaveAttribute('min', '2026-01-10');
      expect(screen.getByLabelText(nombre)).toHaveAttribute('max', '2026-09-24');
    }
  });

  it('"Desde" anterior a la creación del proyecto: mensaje con el tipo de error, campo inválido y sin descarga', () => {
    renderDialog('pdf', { fechaCreacionProyecto: CREACION });

    fireEvent.change(screen.getByLabelText(/desde/i), { target: { value: '2026-01-09' } });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'La fecha "Desde" debe ser igual o posterior a la fecha de creación del proyecto (10/01/2026).',
    );
    expect(screen.getByLabelText(/desde/i)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/hasta/i)).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: /descargar pdf/i })).toBeDisabled();
  });

  it('"Hasta" posterior a la fecha actual: mensaje de fecha futura y sin descarga', () => {
    renderDialog('pdf', { fechaCreacionProyecto: CREACION });

    fireEvent.change(screen.getByLabelText(/hasta/i), { target: { value: '2026-09-25' } });

    expect(screen.getByRole('alert')).toHaveTextContent('La fecha "Hasta" no puede ser posterior a la fecha actual.');
    expect(screen.getByLabelText(/hasta/i)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: /descargar pdf/i })).toBeDisabled();
  });

  it('corregir la fecha limpia el error y vuelve a permitir la descarga', () => {
    const { onConfirm } = renderDialog('pdf', { fechaCreacionProyecto: CREACION });
    const hasta = screen.getByLabelText(/hasta/i);

    fireEvent.change(hasta, { target: { value: '2026-09-25' } });
    fireEvent.change(hasta, { target: { value: '2026-09-24' } });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /descargar pdf/i }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ hasta: '2026-09-24' }));
  });

  it('en el CSV también se validan las fechas', () => {
    const { onConfirm } = renderDialog('csv', { fechaCreacionProyecto: CREACION });

    fireEvent.change(screen.getByLabelText(/desde/i), { target: { value: '2025-12-31' } });

    expect(screen.getByRole('alert')).toHaveTextContent(/fecha de creación del proyecto/);
    expect(screen.getByRole('button', { name: /descargar csv/i })).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('sin fecha de creación conocida no pone mínimo pero sí valida contra hoy', () => {
    renderDialog('pdf');

    expect(screen.getByLabelText(/desde/i)).not.toHaveAttribute('min');
    fireEvent.change(screen.getByLabelText(/hasta/i), { target: { value: '2027-01-01' } });
    expect(screen.getByRole('alert')).toHaveTextContent(/fecha actual/);
  });
});
