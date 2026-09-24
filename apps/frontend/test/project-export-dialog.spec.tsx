import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ProjectExportDialog } from '@/components/projects/project-export-dialog';
import { DEFAULT_EXPORT_OPTIONS, type FormatoExport } from '@/lib/export-options';

/**
 * Revisión del PR (HU-164): el diálogo donde el usuario elige tamaño de
 * fuente, color de tablas, qué datos exportar, rango de fechas y gráficas.
 */

afterEach(() => {
  cleanup();
});

function renderDialog(formato: FormatoExport, props: Partial<{ isPending: boolean }> = {}) {
  const onConfirm = vi.fn();
  const onOpenChange = vi.fn();
  render(
    createElement(ProjectExportDialog, {
      open: true,
      onOpenChange,
      formato,
      isPending: props.isPending ?? false,
      onConfirm,
    }),
  );
  return { onConfirm, onOpenChange };
}

describe('ProjectExportDialog — PDF', () => {
  it('muestra los valores por defecto: fuente mediana, color gris, todos los datos y sin gráficas', () => {
    renderDialog('pdf');

    expect(screen.getByRole('radio', { name: /mediana/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /gris/i })).toBeChecked();
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
    fireEvent.click(screen.getByRole('radio', { name: /azul/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /burndown/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /gráfica de barras/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /gráfica de pastel/i }));
    fireEvent.change(screen.getByLabelText(/desde/i), { target: { value: '2026-02-01' } });
    fireEvent.change(screen.getByLabelText(/hasta/i), { target: { value: '2026-02-28' } });
    fireEvent.click(screen.getByRole('button', { name: /descargar pdf/i }));

    expect(onConfirm).toHaveBeenCalledWith({
      fuente: 'grande',
      color: 'azul',
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

    expect(screen.getByRole('alert')).toHaveTextContent(/desde/i);
    expect(screen.getByRole('button', { name: /descargar pdf/i })).toBeDisabled();
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
