import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ProjectExportDialog } from '@/components/projects/project-export-dialog';
import { DEFAULT_EXPORT_OPTIONS, type FormatoExport } from '@/lib/export-options';

/**
 * Revisión del PR (HU-164) + MEJ-120: el diálogo del PDF se arma por pasos
 * (1 qué incluir, 2 rango de fechas, 3 apariencia, 4 vista previa); el CSV
 * solo ofrece el rango de fechas.
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

const siguiente = () => fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
const atras = () => fireEvent.click(screen.getByRole('button', { name: 'Atrás' }));
/** Paso 1 -> n (n desde 1). */
function irAPaso(n: number) {
  for (let i = 1; i < n; i += 1) siguiente();
}
const descargarPdf = () => fireEvent.click(screen.getByRole('button', { name: /descargar pdf/i }));

describe('ProjectExportDialog — PDF por pasos', () => {
  it('empieza en «Qué incluir» con el progreso de cuatro pasos y sin botón de descarga', () => {
    renderDialog('pdf');

    expect(screen.getByText(/Paso 1 de 4: Qué incluir/)).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Progreso del formulario' }).children).toHaveLength(4);
    expect(screen.getByRole('checkbox', { name: /miembros y horas/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /avance por sprint/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /burndown/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /gráfica de barras/i })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /gráfica de pastel/i })).not.toBeChecked();
    expect(screen.queryByRole('button', { name: /descargar pdf/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });

  it('recorre los pasos en orden: fechas, apariencia y vista previa', () => {
    renderDialog('pdf');

    siguiente();
    expect(screen.getByText(/Paso 2 de 4: Rango de fechas/)).toBeInTheDocument();
    expect(screen.getByLabelText(/desde/i)).toBeInTheDocument();

    siguiente();
    expect(screen.getByText(/Paso 3 de 4: Apariencia/)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /mediana/i })).toBeChecked();
    expect(screen.getByLabelText('Hexadecimal')).toHaveValue('#464646');

    siguiente();
    expect(screen.getByText(/Paso 4 de 4: Vista previa/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /descargar pdf/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Siguiente' })).not.toBeInTheDocument();
  });

  it('«Atrás» vuelve al paso anterior conservando lo elegido', () => {
    renderDialog('pdf');
    fireEvent.click(screen.getByRole('checkbox', { name: /burndown/i }));
    siguiente();
    atras();

    expect(screen.getByText(/Paso 1 de 4/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /burndown/i })).not.toBeChecked();
  });

  it('confirmar sin cambios entrega las opciones por defecto', () => {
    const { onConfirm } = renderDialog('pdf');

    irAPaso(4);
    descargarPdf();

    expect(onConfirm).toHaveBeenCalledWith(DEFAULT_EXPORT_OPTIONS);
  });

  it('entrega lo elegido en cada paso: datos, gráficas, fechas, fuente y color', () => {
    const { onConfirm } = renderDialog('pdf');

    fireEvent.click(screen.getByRole('checkbox', { name: /burndown/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /gráfica de barras/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /gráfica de pastel/i }));
    siguiente();
    fireEvent.change(screen.getByLabelText(/desde/i), { target: { value: '2026-02-01' } });
    fireEvent.change(screen.getByLabelText(/hasta/i), { target: { value: '2026-02-28' } });
    siguiente();
    fireEvent.click(screen.getByRole('radio', { name: /grande/i }));
    fireEvent.change(screen.getByLabelText('Hexadecimal'), { target: { value: '#1e408c' } });
    siguiente();
    descargarPdf();

    expect(onConfirm).toHaveBeenCalledWith({
      fuente: 'grande',
      color: '#1e408c',
      secciones: ['miembros', 'avance'],
      graficas: ['barras', 'pastel'],
      desde: '2026-02-01',
      hasta: '2026-02-28',
    });
  });

  it('la vista previa resume lo elegido y pinta el encabezado con el color', () => {
    renderDialog('pdf');
    fireEvent.click(screen.getByRole('checkbox', { name: /gráfica de barras/i }));
    siguiente();
    fireEvent.change(screen.getByLabelText(/desde/i), { target: { value: '2026-02-01' } });
    siguiente();
    fireEvent.change(screen.getByLabelText('Hexadecimal'), { target: { value: '#ffffff' } });
    siguiente();

    expect(screen.getByText('Miembros y horas, Avance por Sprint, Burndown de Sprints cerrados')).toBeInTheDocument();
    expect(screen.getByText('Gráfica de barras (horas por integrante)')).toBeInTheDocument();
    expect(screen.getByText('01/02/2026 a hoy')).toBeInTheDocument();
    expect(screen.getByTestId('vista-previa-encabezado')).toHaveStyle({ backgroundColor: 'rgb(255, 255, 255)', color: 'rgb(0, 0, 0)' });
  });

  it('sin ningún dato seleccionado avisa y no deja avanzar', () => {
    const { onConfirm } = renderDialog('pdf');

    fireEvent.click(screen.getByRole('checkbox', { name: /miembros y horas/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /avance por sprint/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /burndown/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/al menos un dato/i);
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('las gráficas se deshabilitan (y se descartan) sin la sección de miembros y horas', () => {
    const { onConfirm } = renderDialog('pdf');

    fireEvent.click(screen.getByRole('checkbox', { name: /gráfica de barras/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /miembros y horas/i }));

    expect(screen.getByRole('checkbox', { name: /gráfica de barras/i })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /gráfica de pastel/i })).toBeDisabled();

    irAPaso(4);
    descargarPdf();
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ graficas: [] }));
  });

  it('un rango con "Desde" posterior a "Hasta" avisa y no deja avanzar', () => {
    renderDialog('pdf');
    siguiente();

    fireEvent.change(screen.getByLabelText(/desde/i), { target: { value: '2026-03-10' } });
    fireEvent.change(screen.getByLabelText(/hasta/i), { target: { value: '2026-03-01' } });

    expect(screen.getByRole('alert')).toHaveTextContent(/"Desde" no puede ser posterior a la fecha "Hasta"/);
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });

  it('el selector de color del PDF cambia el color entregado (paleta cerrada)', () => {
    const { onConfirm } = renderDialog('pdf');

    irAPaso(3);
    fireEvent.click(screen.getByRole('radio', { name: 'Azul' }));
    siguiente();
    descargarPdf();

    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ color: '#2680c2' }));
  });

  it('mientras se genera el archivo el botón queda deshabilitado', () => {
    renderDialog('pdf', { isPending: true });
    irAPaso(4);

    expect(screen.getByRole('button', { name: /generando/i })).toBeDisabled();
  });

  it('cancelar en el primer paso cierra el diálogo sin exportar', () => {
    const { onConfirm, onOpenChange } = renderDialog('pdf');

    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('ProjectExportDialog — CSV', () => {
  it('solo ofrece el rango de fechas: sin pasos, fuente, color, datos ni gráficas', () => {
    renderDialog('csv');

    expect(screen.getByLabelText(/desde/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/hasta/i)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Progreso del formulario' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Siguiente' })).not.toBeInTheDocument();
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
    siguiente();

    for (const nombre of [/desde/i, /hasta/i]) {
      expect(screen.getByLabelText(nombre)).toHaveAttribute('min', '2026-01-10');
      expect(screen.getByLabelText(nombre)).toHaveAttribute('max', '2026-09-24');
    }
  });

  it('"Desde" anterior a la creación del proyecto: mensaje con el tipo de error, campo inválido y sin avanzar', () => {
    renderDialog('pdf', { fechaCreacionProyecto: CREACION });
    siguiente();

    fireEvent.change(screen.getByLabelText(/desde/i), { target: { value: '2026-01-09' } });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'La fecha "Desde" debe ser igual o posterior a la fecha de creación del proyecto (10/01/2026).',
    );
    expect(screen.getByLabelText(/desde/i)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/hasta/i)).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });

  it('"Hasta" posterior a la fecha actual: mensaje de fecha futura y sin avanzar', () => {
    renderDialog('pdf', { fechaCreacionProyecto: CREACION });
    siguiente();

    fireEvent.change(screen.getByLabelText(/hasta/i), { target: { value: '2026-09-25' } });

    expect(screen.getByRole('alert')).toHaveTextContent('La fecha "Hasta" no puede ser posterior a la fecha actual.');
    expect(screen.getByLabelText(/hasta/i)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });

  it('corregir la fecha limpia el error y vuelve a permitir avanzar y descargar', () => {
    const { onConfirm } = renderDialog('pdf', { fechaCreacionProyecto: CREACION });
    siguiente();
    const hasta = screen.getByLabelText(/hasta/i);

    fireEvent.change(hasta, { target: { value: '2026-09-25' } });
    fireEvent.change(hasta, { target: { value: '2026-09-24' } });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    siguiente();
    siguiente();
    descargarPdf();
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
    siguiente();

    expect(screen.getByLabelText(/desde/i)).not.toHaveAttribute('min');
    fireEvent.change(screen.getByLabelText(/hasta/i), { target: { value: '2027-01-01' } });
    expect(screen.getByRole('alert')).toHaveTextContent(/fecha actual/);
  });
});

describe('ProjectExportDialog — errores visibles al volver a pasos', () => {
  it('al volver al paso de fechas con un rango inválido se ve el mensaje y no deja avanzar', () => {
    renderDialog('pdf', { fechaCreacionProyecto: '2026-01-10T15:00:00.000Z' });
    siguiente();
    fireEvent.change(screen.getByLabelText(/hasta/i), { target: { value: '2026-09-24' } });
    siguiente();
    siguiente();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    atras();
    atras();
    fireEvent.change(screen.getByLabelText(/desde/i), { target: { value: '2026-09-24' } });
    fireEvent.change(screen.getByLabelText(/hasta/i), { target: { value: '2026-09-23' } });
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent(/"Desde" no puede ser posterior/);
  });
});
