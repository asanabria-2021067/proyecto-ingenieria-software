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

// Mis Horas usa la variante en línea: el icono es un fondo decorativo que
// ocupa el alto de la tarjeta, asoma solo su mitad desde el borde izquierdo
// y es translúcido; el texto, en tonos neutros, empieza después de esa
// mitad. La vista del integrante sigue con la variante por defecto (caja).
describe('HoursKpiCard — variante en línea', () => {
  afterEach(() => cleanup());

  it('el icono es un fondo del alto de la tarjeta, asomado a la mitad, translúcido y difuminado', () => {
    render(<HoursKpiCard variante="en-linea" icon={Clock} label="Registradas" value="75 h" />);

    const grupo = screen.getByRole('group', { name: 'Registradas' });
    const icono = grupo.querySelector('[data-slot="kpi-icono-fondo"]')!;
    // Todo el alto de la tarjeta, cuadrado y centrado en su borde izquierdo:
    // la tarjeta recorta la mitad exterior.
    expect(icono).toHaveClass('absolute', 'inset-y-0', 'left-0', 'h-full', 'aspect-square', '-translate-x-1/2');
    expect(icono).toHaveClass('opacity-15', 'blur-[1px]', 'pointer-events-none', 'text-text-primary');
    expect(icono).toHaveAttribute('aria-hidden', 'true');
    expect(grupo).toHaveClass('relative', 'overflow-hidden', 'min-h-32');
    expect(grupo.innerHTML).not.toMatch(/bg-primary/);
  });

  it('el texto empieza después de la mitad visible del icono', () => {
    render(<HoursKpiCard variante="en-linea" icon={Clock} label="Registradas" value="75 h" note="Nota" />);

    const grupo = screen.getByRole('group', { name: 'Registradas' });
    // La mitad visible del icono mide la mitad del alto (64 px en una tarjeta
    // de 128 px); pl-24 = 96 px deja el texto después de ella.
    expect(grupo).toHaveClass('pl-24');
    expect(within(grupo).getByText('Registradas').querySelector('svg')).toBeNull();
    expect(within(grupo).getByText('75 h')).toBeInTheDocument();
    expect(within(grupo).getByText('Nota')).toBeInTheDocument();
  });

  it('etiqueta y valor en tono neutro, sin verdes', () => {
    render(<HoursKpiCard variante="en-linea" icon={CheckCircle2} label="Acreditadas" value="22.25 h" destacado />);

    const grupo = screen.getByRole('group', { name: 'Acreditadas' });
    expect(within(grupo).getByText('Acreditadas')).toHaveClass('text-text-primary');
    expect(within(grupo).getByText('22.25 h')).toHaveClass('text-text-primary');
    expect(grupo.innerHTML).not.toMatch(/(?<![\w-])text-(primary|tertiary)\b/);
    expect(grupo).toHaveAttribute('data-destacado', 'true');
  });

  it('la variante por defecto conserva la caja de color del icono', () => {
    render(<HoursKpiCard icon={Clock} label="Registradas" value="75 h" />);

    expect(screen.getByRole('group', { name: 'Registradas' }).firstElementChild).toHaveClass('bg-primary/10');
  });
});
