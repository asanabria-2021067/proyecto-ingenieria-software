import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MyHoursRequirements } from '../components/hours/my-hours-requirements';
import type { MisHorasPorTipo, MisHorasView } from '../lib/services/users';

// HU-158 (T-232): el progreso usa SOLO las acreditadas de cada tipo que envía
// el backend; el único cálculo local es el porcentaje de la barra (R-10/R-11).

/** porTipo con registradas y propuestas «trampa»: nunca deben mostrarse ni acercar la meta. */
function porTipo(acreditadas: { beca?: string; extension?: string; experiencia?: string }): MisHorasPorTipo[] {
  return [
    { tipoProyecto: 'ACADEMICO_HORAS_BECA', registradasEnProyectosAbiertos: '91.00', propuestasPendientes: '81.00', acreditadas: acreditadas.beca ?? '0.00' },
    { tipoProyecto: 'EXTRACURRICULAR_EXTENSION', registradasEnProyectosAbiertos: '92.00', propuestasPendientes: '82.00', acreditadas: acreditadas.extension ?? '0.00' },
    { tipoProyecto: 'ACADEMICO_EXPERIENCIA', registradasEnProyectosAbiertos: '93.00', propuestasPendientes: '83.00', acreditadas: acreditadas.experiencia ?? '0.00' },
  ];
}

function renderizar(requisitos: MisHorasView['requisitos'], filas: MisHorasPorTipo[]) {
  render(<MyHoursRequirements requisitos={requisitos} porTipo={filas} />);
  return {
    fila: (nombre: string) => screen.getByRole('listitem', { name: nombre }),
  };
}

describe('MyHoursRequirements', () => {
  afterEach(() => cleanup());

  it('muestra Beca, Extensión y Experiencia en ese orden, aunque porTipo llegue en otro', () => {
    renderizar({ horasBecaRequeridas: 150, horasExtensionRequeridas: 40 }, porTipo({}).reverse());

    expect(screen.getByRole('heading', { name: 'Progreso de acreditación' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((li) => li.getAttribute('aria-labelledby'))).toEqual([
      'mis-horas-meta-ACADEMICO_HORAS_BECA',
      'mis-horas-meta-EXTRACURRICULAR_EXTENSION',
      'mis-horas-meta-ACADEMICO_EXPERIENCIA',
    ]);
  });

  it('porcentaje normal: acreditadas sobre la meta, redondeado hacia abajo', () => {
    const { fila } = renderizar({ horasBecaRequeridas: 150, horasExtensionRequeridas: 40 }, porTipo({ beca: '22.25' }));

    const beca = fila('Horas beca');
    expect(within(beca).getByText('22.25 h')).toBeInTheDocument();
    expect(within(beca).getByText('de 150 h')).toBeInTheDocument();
    // 22.25 / 150 = 14.83 % → 14 %.
    expect(within(beca).getByRole('progressbar', { name: 'Progreso de horas beca' })).toHaveAttribute('aria-valuenow', '14');
    expect(within(beca).getByText('14 %')).toBeInTheDocument();
    expect(within(beca).queryByText('Meta cumplida')).not.toBeInTheDocument();
  });

  it('más de lo requerido: la barra se topa en 100 % y aparece «Meta cumplida»', () => {
    const { fila } = renderizar({ horasBecaRequeridas: 150, horasExtensionRequeridas: 40 }, porTipo({ extension: '45.00' }));

    const extension = fila('Horas de extensión');
    expect(within(extension).getByText('45 h')).toBeInTheDocument();
    expect(within(extension).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    expect(within(extension).getByText('100 %')).toBeInTheDocument();
    expect(within(extension).getByText('Meta cumplida')).toHaveClass('pill', 'pill-success');
  });

  it('la meta se cumple justo al alcanzarla, no una centésima antes', () => {
    const { fila } = renderizar({ horasBecaRequeridas: 40, horasExtensionRequeridas: 40 }, porTipo({ beca: '40.00', extension: '39.99' }));

    expect(within(fila('Horas beca')).getByText('Meta cumplida')).toBeInTheDocument();
    expect(within(fila('Horas de extensión')).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '99');
    expect(within(fila('Horas de extensión')).queryByText('Meta cumplida')).not.toBeInTheDocument();
  });

  it('meta sin configurar: sin barra, con «Sin meta configurada» y enlace al perfil', () => {
    const { fila } = renderizar({ horasBecaRequeridas: null, horasExtensionRequeridas: 40 }, porTipo({ beca: '12.50' }));

    const beca = fila('Horas beca');
    expect(within(beca).getByText('12.5 h')).toBeInTheDocument();
    expect(within(beca).getByText(/Sin meta configurada/)).toBeInTheDocument();
    expect(within(beca).getByRole('link', { name: 'Configúrala en tu perfil' })).toHaveAttribute('href', '/dashboard/perfil');
    expect(within(beca).queryByRole('progressbar')).not.toBeInTheDocument();
    // La otra meta sí está configurada.
    expect(within(fila('Horas de extensión')).getByRole('progressbar')).toBeInTheDocument();
  });

  it('una meta en 0 se trata como sin configurar (no divide entre cero)', () => {
    const { fila } = renderizar({ horasBecaRequeridas: 0, horasExtensionRequeridas: 40 }, porTipo({ beca: '3.00' }));

    const beca = fila('Horas beca');
    expect(within(beca).queryByRole('progressbar')).not.toBeInTheDocument();
    expect(within(beca).getByText(/Sin meta configurada/)).toBeInTheDocument();
    expect(beca.textContent).not.toMatch(/NaN|Infinity/);
  });

  it('Experiencia muestra sus acreditadas sin barra, sin meta y sin enlace al perfil', () => {
    const { fila } = renderizar({ horasBecaRequeridas: 150, horasExtensionRequeridas: 40 }, porTipo({ experiencia: '3.00' }));

    const experiencia = fila('Experiencia');
    expect(within(experiencia).getByText('3 h')).toBeInTheDocument();
    expect(within(experiencia).getByText('Sin meta configurada')).toBeInTheDocument();
    expect(within(experiencia).queryByRole('progressbar')).not.toBeInTheDocument();
    expect(within(experiencia).queryByRole('link')).not.toBeInTheDocument();
  });

  it('las cifras son las acreditadas del prop: registradas y propuestas no se muestran ni cuentan', () => {
    renderizar({ horasBecaRequeridas: 150, horasExtensionRequeridas: 40 }, porTipo({ beca: '22.25', extension: '0.00', experiencia: '0.00' }));

    const texto = screen.getByRole('region', { name: 'Progreso de acreditación' }).textContent ?? '';
    for (const trampa of ['91', '92', '93', '81', '82', '83']) {
      expect(texto).not.toContain(trampa);
    }
    expect(screen.getByRole('progressbar', { name: 'Progreso de horas de extensión' })).toHaveAttribute('aria-valuenow', '0');
  });
});
