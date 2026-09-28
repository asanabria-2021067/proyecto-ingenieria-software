import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { CheckCircle2, Clock } from 'lucide-react';
import { HoursKpiCard } from '../components/hours/hours-kpi-card';

// HU-158 (T-232): KPI compartido entre la vista del integrante y Mis Horas.
describe('HoursKpiCard', () => {
  afterEach(() => cleanup());

  it('es un grupo accesible nombrado por su etiqueta, con la etiqueta y el valor dentro', () => {
    render(<HoursKpiCard icon={Clock} label="Registradas en proyectos abiertos" value="12.5 h" />);

    const grupo = screen.getByRole('group', { name: 'Registradas en proyectos abiertos' });
    expect(within(grupo).getByText('Registradas en proyectos abiertos')).toBeInTheDocument();
    expect(within(grupo).getByText('12.5 h')).toBeInTheDocument();
  });

  it('muestra el valor recibido tal cual: no formatea ni calcula', () => {
    render(<HoursKpiCard icon={Clock} label="Propuestas" value="0.00" />);

    expect(within(screen.getByRole('group', { name: 'Propuestas' })).getByText('0.00')).toBeInTheDocument();
  });

  it('la nota aparece dentro del grupo solo cuando se pasa', () => {
    const { rerender } = render(<HoursKpiCard icon={Clock} label="Registradas" value="12.5 h" />);
    expect(screen.queryByText(/legacy/)).not.toBeInTheDocument();

    rerender(
      <HoursKpiCard icon={Clock} label="Registradas" value="12.5 h" note="+ 2 h históricas (legacy), mostradas aparte" />,
    );
    expect(
      within(screen.getByRole('group', { name: 'Registradas' })).getByText('+ 2 h históricas (legacy), mostradas aparte'),
    ).toBeInTheDocument();
  });

  it('la variante destacada resalta el icono y queda marcada; la normal no', () => {
    render(
      <>
        <HoursKpiCard icon={Clock} label="Registradas" value="12.5 h" />
        <HoursKpiCard icon={CheckCircle2} label="Acreditadas" value="22.25 h" destacado />
      </>,
    );

    const normal = screen.getByRole('group', { name: 'Registradas' });
    const destacada = screen.getByRole('group', { name: 'Acreditadas' });
    expect(normal).not.toHaveAttribute('data-destacado');
    expect(destacada).toHaveAttribute('data-destacado', 'true');
    expect(normal.firstElementChild).toHaveClass('bg-primary/10');
    expect(destacada.firstElementChild).toHaveClass('bg-primary/15');
  });

  it('el icono es decorativo: no añade texto al nombre accesible', () => {
    render(<HoursKpiCard icon={Clock} label="Registradas" value="12.5 h" />);

    const icono = screen.getByRole('group', { name: 'Registradas' }).querySelector('svg');
    expect(icono).toHaveAttribute('aria-hidden', 'true');
  });
});
