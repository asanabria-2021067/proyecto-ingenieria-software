import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { TaskLabelChip } from '../components/projects/task-label-chip';
import type { EtiquetaTareaDTO } from '../lib/types/tasks';

function etiqueta(overrides: Partial<EtiquetaTareaDTO> = {}): EtiquetaTareaDTO {
  return {
    idEtiqueta: 1,
    nombreEtiqueta: 'Urgente',
    nombreNormalizado: 'urgente',
    color: '#FF0000',
    ...overrides,
  };
}

describe('TaskLabelChip', () => {
  afterEach(() => cleanup());

  it('muestra el nombre visible de la etiqueta', () => {
    render(createElement(TaskLabelChip, { etiqueta: etiqueta({ nombreEtiqueta: 'Backend' }) }));
    expect(screen.getByText('Backend')).toBeInTheDocument();
  });

  it('usa un indicador de color con el color real recibido, no como fondo del texto', () => {
    const { container } = render(
      createElement(TaskLabelChip, { etiqueta: etiqueta({ color: '#00FF00' }) }),
    );
    const punto = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(punto).toBeInTheDocument();
    expect(punto.style.backgroundColor).toBe('rgb(0, 255, 0)');

    const chip = screen.getByText('Urgente', { exact: false }).closest('span');
    // El color de la etiqueta nunca se aplica como backgroundColor del chip
    // completo (solo del punto decorativo), evitando riesgo de contraste.
    expect(chip?.style.backgroundColor).not.toBe('rgb(0, 255, 0)');
  });

  it('nombres distintos producen chips visualmente distinguibles por texto, no solo por color', () => {
    render(
      createElement(
        'div',
        null,
        createElement(TaskLabelChip, { etiqueta: etiqueta({ idEtiqueta: 1, nombreEtiqueta: 'Frontend', color: '#111111' }) }),
        createElement(TaskLabelChip, { etiqueta: etiqueta({ idEtiqueta: 2, nombreEtiqueta: 'Backend', color: '#222222' }) }),
      ),
    );
    expect(screen.getByText('Frontend')).toBeInTheDocument();
    expect(screen.getByText('Backend')).toBeInTheDocument();
  });

  it('no expone nombreNormalizado en el DOM', () => {
    const { container } = render(
      createElement(TaskLabelChip, {
        etiqueta: etiqueta({ nombreEtiqueta: 'Urgente', nombreNormalizado: 'urgente-normalizado-unico' }),
      }),
    );
    expect(container.textContent).not.toContain('urgente-normalizado-unico');
  });
});
