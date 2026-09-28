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

  it('en línea, el tono de atención pinta en naranja solo la cifra, no la tarjeta', () => {
    const { rerender } = render(<HoursKpiCard variante="en-linea" icon={Clock} label="Exceso" value="2 h" />);
    expect(screen.getByText('2 h')).toHaveClass('text-text-primary');

    rerender(<HoursKpiCard variante="en-linea" icon={Clock} label="Exceso" value="2 h" tono="atencion" />);
    expect(screen.getByText('2 h')).toHaveClass('text-attention-strong');
    expect(screen.getByRole('group', { name: 'Exceso' })).toHaveClass('card-base');
    expect(screen.getByRole('group', { name: 'Exceso' }).className).not.toMatch(/attention/);
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

// Mis Horas usa la variante en línea: icono neutro al par de la etiqueta,
// sin caja de color, y todo el texto en tonos neutros. La vista del
// integrante sigue con la variante por defecto (caja).
describe('HoursKpiCard — variante en línea', () => {
  afterEach(() => cleanup());

  it('pone el icono dentro de la fila de la etiqueta, sin caja de fondo', () => {
    render(<HoursKpiCard variante="en-linea" icon={Clock} label="Registradas" value="75 h" />);

    const grupo = screen.getByRole('group', { name: 'Registradas' });
    const etiqueta = within(grupo).getByText('Registradas');
    const icono = grupo.querySelector('svg')!;
    expect(etiqueta).toContainElement(icono as unknown as HTMLElement);
    expect(icono).toHaveClass('size-5', 'text-text-primary');
    expect(icono).toHaveAttribute('aria-hidden', 'true');
    expect(grupo.innerHTML).not.toMatch(/bg-primary/);
  });

  it('etiqueta y valor en tono neutro, sin verdes', () => {
    render(<HoursKpiCard variante="en-linea" icon={CheckCircle2} label="Acreditadas" value="22.25 h" destacado />);

    const grupo = screen.getByRole('group', { name: 'Acreditadas' });
    expect(within(grupo).getByText('Acreditadas')).toHaveClass('text-text-primary');
    expect(within(grupo).getByText('22.25 h')).toHaveClass('text-text-primary');
    expect(grupo.innerHTML).not.toMatch(/(?<![\w-])text-(primary|tertiary)\b/);
    expect(grupo).toHaveAttribute('data-destacado', 'true');
  });

  it('mientras carga muestra un esqueleto en lugar de la cifra, sin perder etiqueta ni icono', () => {
    render(<HoursKpiCard variante="en-linea" icon={Clock} label="Integrantes activos" value="8" isLoading />);

    const grupo = screen.getByRole('group', { name: 'Integrantes activos' });
    expect(grupo.querySelector('[data-slot="kpi-cargando"]')).not.toBeNull();
    expect(within(grupo).queryByText('8')).not.toBeInTheDocument();
    expect(grupo.querySelector('svg')).toHaveClass('size-5', 'text-text-primary');
  });

  it('la variante por defecto conserva la caja de color del icono', () => {
    render(<HoursKpiCard icon={Clock} label="Registradas" value="75 h" />);

    expect(screen.getByRole('group', { name: 'Registradas' }).firstElementChild).toHaveClass('bg-primary/10');
  });
});

// Mis Horas descartó el icono de fondo tipo marca de agua: el icono es
// pequeño, está en flujo y va inmediatamente antes de la etiqueta.
describe('HoursKpiCard — sin icono de marca de agua', () => {
  afterEach(() => cleanup());

  it('no hay icono absoluto, translúcido, difuminado ni gigante', () => {
    render(<HoursKpiCard variante="en-linea" icon={Clock} label="Registradas" value="75 h" note="Nota" />);

    const grupo = screen.getByRole('group', { name: 'Registradas' });
    expect(grupo.querySelectorAll('svg')).toHaveLength(1);
    expect(grupo.querySelector('[data-slot="kpi-icono-fondo"]')).toBeNull();
    expect(grupo.innerHTML).not.toMatch(/\b(absolute|opacity-\d+|blur-|size-32|h-full|-translate-x-)/);
    expect(grupo).not.toHaveClass('overflow-hidden', 'pl-24', 'min-h-32');
  });

  it('icono de 20 px en fila con la etiqueta (flex, items-center, gap de 0.5rem), valor y nota debajo alineados con el texto', () => {
    render(<HoursKpiCard variante="en-linea" icon={Clock} label="Registradas" value="75 h" note="Nota" />);

    const grupo = screen.getByRole('group', { name: 'Registradas' });
    const fila = within(grupo).getByText('Registradas');
    expect(fila).toHaveClass('flex', 'items-center', 'gap-tight');
    expect(fila.firstElementChild).toBe(grupo.querySelector('svg'));
    expect(grupo.querySelector('svg')).toHaveClass('size-5', 'text-text-primary');
    const [etiqueta, cuerpo] = Array.from(grupo.children);
    expect(etiqueta).toBe(fila);
    expect(fila).toHaveClass('font-semibold', 'uppercase');
    // pl-7 = icono (size-5) + gap-tight: la cifra arranca donde arranca el texto de la etiqueta.
    expect(cuerpo).toHaveClass('pl-7');
    const [valor, nota] = Array.from(cuerpo.children);
    expect(valor).toHaveTextContent('75 h');
    expect(valor).toHaveClass('text-3xl', 'font-bold', 'text-text-primary');
    expect(nota).toHaveTextContent('Nota');
  });

  it('usa la carcasa de tarjeta del sistema de diseño (card-base)', () => {
    render(<HoursKpiCard variante="en-linea" icon={Clock} label="Registradas" value="75 h" />);

    const grupo = screen.getByRole('group', { name: 'Registradas' });
    expect(grupo).toHaveClass('card-base');
    expect(grupo.className).not.toMatch(/\b(rounded-2xl|p-5|border-outline-variant)\b/);
  });
});
