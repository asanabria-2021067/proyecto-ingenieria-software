import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SprintReportsDialog } from '../components/projects/sprint-reports-dialog';

afterEach(cleanup);

const GRAFICAS = [
  'Horas por integrante',
  'Tareas por estado a lo largo del Sprint',
  'Tiempo promedio por columna',
  'Horas estimadas contra reales',
];

function montar(esLider?: boolean) {
  render(
    <SprintReportsDialog open onOpenChange={vi.fn()} idProyecto={7} idSprintBurndown={3} esLider={esLider} />,
  );
}

describe('SprintReportsDialog (permisos de los informes de equipo)', () => {
  it('el líder ve las cuatro tarjetas y enlazan a la página de gráficas del Sprint', () => {
    montar(true);
    for (const titulo of GRAFICAS) {
      const enlace = screen.getByText(titulo).closest('a');
      expect(enlace).toHaveAttribute('href', '/dashboard/proyectos/7/sprints/3/informes/graficas');
    }
  });

  it('quien no es líder no ve las tarjetas de gráficas, pero sí burndown y velocidad', () => {
    montar(false);
    for (const titulo of GRAFICAS) expect(screen.queryByText(titulo)).not.toBeInTheDocument();
    expect(screen.getByText('Informe de velocidad')).toBeInTheDocument();
    expect(screen.getByText('Diagrama de trabajo pendiente de Sprint')).toBeInTheDocument();
  });

  it('por defecto (sin saber si es líder) también se ocultan', () => {
    montar();
    expect(screen.queryByText(GRAFICAS[0])).not.toBeInTheDocument();
  });
});
