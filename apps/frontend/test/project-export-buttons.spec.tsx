import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_EXPORT_OPTIONS } from '@/lib/export-options';

/**
 * T-259/T-260/T-261 (HU-164): el botón de exportar es solo conveniencia —
 * la restricción real vive en el backend (scope `exportacion`). Este spec
 * cubre el gating (líder/admin lo ven, un participante normal no) y que
 * cada botón dispara su propia mutación sin bloquear al otro.
 */

vi.mock('@/hooks/use-is-project-leader', () => ({ useIsProjectLeader: vi.fn() }));
vi.mock('@/hooks/use-current-user', () => ({ useIsAdmin: vi.fn() }));
vi.mock('@/hooks/use-project-export', () => ({ useProjectExport: vi.fn() }));

import { ProjectExportButtons } from '@/components/projects/project-export-buttons';
import { useIsProjectLeader } from '@/hooks/use-is-project-leader';
import { useIsAdmin } from '@/hooks/use-current-user';
import { useProjectExport } from '@/hooks/use-project-export';

function mockMutation(overrides: Record<string, unknown> = {}) {
  return { mutate: vi.fn(), isPending: false, isError: false, ...overrides };
}

function renderButtons() {
  return render(createElement(ProjectExportButtons, { idProyecto: 5 }));
}

describe('ProjectExportButtons', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('no renderiza nada para un integrante que no es líder ni admin', () => {
    (useIsProjectLeader as any).mockReturnValue(false);
    (useIsAdmin as any).mockReturnValue(false);
    (useProjectExport as any).mockReturnValue({ exportCsv: mockMutation(), exportPdf: mockMutation() });

    const { container } = renderButtons();

    expect(container).toBeEmptyDOMElement();
  });

  it('el líder ve ambos botones de exportar', () => {
    (useIsProjectLeader as any).mockReturnValue(true);
    (useIsAdmin as any).mockReturnValue(false);
    (useProjectExport as any).mockReturnValue({ exportCsv: mockMutation(), exportPdf: mockMutation() });

    renderButtons();

    expect(screen.getByRole('button', { name: /exportar csv/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /exportar pdf/i })).toBeInTheDocument();
  });

  it('la administración también ve ambos botones aunque no sea líder del proyecto', () => {
    (useIsProjectLeader as any).mockReturnValue(false);
    (useIsAdmin as any).mockReturnValue(true);
    (useProjectExport as any).mockReturnValue({ exportCsv: mockMutation(), exportPdf: mockMutation() });

    renderButtons();

    expect(screen.getByRole('button', { name: /exportar csv/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /exportar pdf/i })).toBeInTheDocument();
  });

  it('"Exportar CSV" abre el diálogo de opciones y NO exporta hasta confirmar', () => {
    (useIsProjectLeader as any).mockReturnValue(true);
    (useIsAdmin as any).mockReturnValue(false);
    const exportCsv = mockMutation();
    (useProjectExport as any).mockReturnValue({ exportCsv, exportPdf: mockMutation() });

    renderButtons();
    fireEvent.click(screen.getByRole('button', { name: /exportar csv/i }));

    expect(screen.getByRole('dialog')).toHaveTextContent(/exportar csv/i);
    expect(exportCsv.mutate).not.toHaveBeenCalled();
  });

  it('confirmar en el diálogo de CSV dispara exportCsv.mutate con las opciones, sin tocar exportPdf', () => {
    (useIsProjectLeader as any).mockReturnValue(true);
    (useIsAdmin as any).mockReturnValue(false);
    const exportCsv = mockMutation();
    const exportPdf = mockMutation();
    (useProjectExport as any).mockReturnValue({ exportCsv, exportPdf });

    renderButtons();
    fireEvent.click(screen.getByRole('button', { name: /exportar csv/i }));
    fireEvent.click(screen.getByRole('button', { name: /descargar csv/i }));

    expect(exportCsv.mutate).toHaveBeenCalledTimes(1);
    expect(exportCsv.mutate).toHaveBeenCalledWith(DEFAULT_EXPORT_OPTIONS, expect.anything());
    expect(exportPdf.mutate).not.toHaveBeenCalled();
  });

  it('confirmar en el diálogo de PDF dispara exportPdf.mutate con lo elegido, sin tocar exportCsv', () => {
    (useIsProjectLeader as any).mockReturnValue(true);
    (useIsAdmin as any).mockReturnValue(false);
    const exportCsv = mockMutation();
    const exportPdf = mockMutation();
    (useProjectExport as any).mockReturnValue({ exportCsv, exportPdf });

    renderButtons();
    fireEvent.click(screen.getByRole('button', { name: /exportar pdf/i }));
    fireEvent.click(screen.getByRole('radio', { name: /grande/i }));
    fireEvent.click(screen.getByRole('button', { name: /descargar pdf/i }));

    expect(exportPdf.mutate).toHaveBeenCalledTimes(1);
    expect(exportPdf.mutate).toHaveBeenCalledWith(
      { ...DEFAULT_EXPORT_OPTIONS, fuente: 'grande' },
      expect.anything(),
    );
    expect(exportCsv.mutate).not.toHaveBeenCalled();
  });

  it('el diálogo se cierra al terminar la exportación (onSettled)', () => {
    (useIsProjectLeader as any).mockReturnValue(true);
    (useIsAdmin as any).mockReturnValue(false);
    const exportPdf = mockMutation({
      mutate: vi.fn((_opciones: unknown, callbacks: { onSettled: () => void }) => callbacks.onSettled()),
    });
    (useProjectExport as any).mockReturnValue({ exportCsv: mockMutation(), exportPdf });

    renderButtons();
    fireEvent.click(screen.getByRole('button', { name: /exportar pdf/i }));
    fireEvent.click(screen.getByRole('button', { name: /descargar pdf/i }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('deshabilita el botón de CSV mientras exportCsv.isPending es true', () => {
    (useIsProjectLeader as any).mockReturnValue(true);
    (useIsAdmin as any).mockReturnValue(false);
    (useProjectExport as any).mockReturnValue({
      exportCsv: mockMutation({ isPending: true }),
      exportPdf: mockMutation(),
    });

    renderButtons();

    expect(screen.getByRole('button', { name: /exportando/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /exportar pdf/i })).not.toBeDisabled();
  });

  it('muestra un aviso de error si exportPdf falla', () => {
    (useIsProjectLeader as any).mockReturnValue(true);
    (useIsAdmin as any).mockReturnValue(false);
    (useProjectExport as any).mockReturnValue({
      exportCsv: mockMutation(),
      exportPdf: mockMutation({ isError: true }),
    });

    renderButtons();

    expect(screen.getByRole('alert')).toHaveTextContent(/no se pudo generar/i);
  });
});
