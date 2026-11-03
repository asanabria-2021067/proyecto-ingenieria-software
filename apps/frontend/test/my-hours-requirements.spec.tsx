import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MyHoursRequirements } from '../components/hours/my-hours-requirements';
import type { MisHorasPorTipo } from '../lib/services/users';

// HU-158 (T-232): el bloque muestra SOLO las acreditadas en total de cada tipo que envía
// el backend (R-11). No se miden contra la meta: la meta es del semestre.

/** porTipo con registradas y propuestas «trampa»: nunca deben mostrarse. */
function porTipo(acreditadas: { beca?: string; extension?: string; experiencia?: string }): MisHorasPorTipo[] {
  return [
    { tipoProyecto: 'ACADEMICO_HORAS_BECA', registradasEnProyectosAbiertos: '91.00', propuestasPendientes: '81.00', acreditadas: acreditadas.beca ?? '0.00' },
    { tipoProyecto: 'EXTRACURRICULAR_EXTENSION', registradasEnProyectosAbiertos: '92.00', propuestasPendientes: '82.00', acreditadas: acreditadas.extension ?? '0.00' },
    { tipoProyecto: 'ACADEMICO_EXPERIENCIA', registradasEnProyectosAbiertos: '93.00', propuestasPendientes: '83.00', acreditadas: acreditadas.experiencia ?? '0.00' },
  ];
}

function renderizar(filas: MisHorasPorTipo[]) {
  render(<MyHoursRequirements porTipo={filas} />);
  return {
    fila: (nombre: string) => screen.getByRole('listitem', { name: nombre }),
  };
}

describe('MyHoursRequirements', () => {
  afterEach(() => cleanup());

  it('muestra Beca, Extensión y Experiencia en ese orden, aunque porTipo llegue en otro', () => {
    renderizar(porTipo({}).reverse());

    expect(screen.getByRole('heading', { name: 'Acreditadas en total por tipo' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((li) => li.getAttribute('aria-labelledby'))).toEqual([
      'mis-horas-meta-ACADEMICO_HORAS_BECA',
      'mis-horas-meta-EXTRACURRICULAR_EXTENSION',
      'mis-horas-meta-ACADEMICO_EXPERIENCIA',
    ]);
  });

  it('cada tipo muestra sus acreditadas en total, sin meta, barra ni porcentaje', () => {
    const { fila } = renderizar(porTipo({ beca: '22.25', extension: '45.00', experiencia: '3.00' }));

    expect(fila('Horas beca')).toHaveTextContent('22.25 h');
    expect(fila('Horas de extensión')).toHaveTextContent('45 h');
    expect(fila('Experiencia')).toHaveTextContent('3 h');
    const region = screen.getByRole('region', { name: 'Acreditadas en total por tipo' });
    expect(within(region).queryByRole('progressbar')).not.toBeInTheDocument();
    expect(region.textContent).not.toMatch(/ de \d+ h|%|Meta cumplida|Sin meta|NaN/);
  });

  it('aclara que la meta se mide por semestre', () => {
    renderizar(porTipo({}));
    expect(screen.getByText(/Tu meta se mide por semestre/)).toBeInTheDocument();
  });

  it('las cifras son las acreditadas del prop: registradas y propuestas no se muestran', () => {
    renderizar(porTipo({ beca: '22.25', extension: '0.00', experiencia: '0.00' }));

    const texto = screen.getByRole('region', { name: 'Acreditadas en total por tipo' }).textContent ?? '';
    for (const trampa of ['91', '92', '93', '81', '82', '83']) {
      expect(texto).not.toContain(trampa);
    }
  });
});
