import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MiniCalendar } from '../components/calendar/mini-calendar';

afterEach(() => {
  cleanup();
});

function renderMini(extra: Partial<Parameters<typeof MiniCalendar>[0]> = {}) {
  const onSelectDay = vi.fn();
  const onPrevMonth = vi.fn();
  const onNextMonth = vi.fn();
  render(
    <MiniCalendar
      year={2026}
      month={9}
      todayKey="2026-10-09"
      markedDates={new Set(['2026-10-20'])}
      onPrevMonth={onPrevMonth}
      onNextMonth={onNextMonth}
      onSelectDay={onSelectDay}
      {...extra}
    />,
  );
  return { onSelectDay, onPrevMonth, onNextMonth };
}

const hoy = () => document.querySelector('[aria-current="date"]') as HTMLElement;

describe('MiniCalendar — color de "hoy" opcional (G04-C09, UI-41)', () => {
  it('sin la prop conserva el aspecto de siempre: hoy en acento (tablero y widgets compartidos no cambian)', () => {
    renderMini();
    expect(hoy()).toHaveTextContent('9');
    expect(hoy()).toHaveClass('bg-accent', 'font-bold', 'text-on-accent');
    expect(hoy()).not.toHaveClass('bg-primary');
  });

  it('con todayTone="primary" hoy usa el mismo primario que las vistas del calendario', () => {
    renderMini({ todayTone: 'primary' });
    expect(hoy()).toHaveClass('bg-primary', 'font-bold', 'text-on-primary');
    expect(hoy()).not.toHaveClass('bg-accent');
  });

  it.each(['accent', 'primary'] as const)('con todayTone="%s" el resto del comportamiento es idéntico: selección, marcas, navegación y días', (todayTone) => {
    const { onSelectDay, onPrevMonth, onNextMonth } = renderMini({ todayTone, selectedKey: '2026-10-21' });
    expect(screen.getAllByRole('button')).toHaveLength(42 + 2);
    expect(screen.getByRole('button', { name: '21' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '21' })).toHaveClass('bg-surface-container-high');
    // Marca de actividad: en un día normal sí, en hoy no (el relleno ya lo distingue).
    expect(screen.getByRole('button', { name: '20' }).querySelector('span.bg-primary')).not.toBeNull();
    expect(hoy().querySelector('span')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '20' }));
    expect(onSelectDay).toHaveBeenCalledWith('2026-10-20');
    fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }));
    expect(onPrevMonth).toHaveBeenCalledTimes(1);
    expect(onNextMonth).toHaveBeenCalledTimes(1);
  });

  it('sin onSelectDay (uso de solo lectura del tablero) los días siguen deshabilitados y sin aria-pressed', () => {
    render(<MiniCalendar year={2026} month={9} todayKey="2026-10-09" markedDates={new Set()} onPrevMonth={() => {}} onNextMonth={() => {}} />);
    expect(hoy()).toBeDisabled();
    expect(hoy()).not.toHaveAttribute('aria-pressed');
    expect(hoy()).toHaveClass('bg-accent');
  });
});

describe('MiniCalendar — el número de "hoy" es legible con todayTone="primary" (corrección de G04-C09)', () => {
  // En el navegador `text-text-primary` ganaba a `text-on-primary` por orden de CSS: el "9" quedaba
  // oscuro sobre el verde primario (2.44:1 en claro, 1.5:1 en oscuro). Con el tono primario, hoy no
  // debe llevar ninguna otra clase de color de texto.
  const coloresDeTexto = (el: HTMLElement) => [...el.classList].filter((c) => /^text-(text-|on-)/.test(c));

  it('con todayTone="primary" hoy solo lleva text-on-primary como color de texto', () => {
    renderMini({ todayTone: 'primary' });
    expect(coloresDeTexto(hoy())).toEqual(['text-on-primary']);
  });

  it('también cuando hoy cae fuera del mes mostrado (celda de un mes vecino)', () => {
    // La rejilla de octubre empieza el lunes 28 de septiembre: el 29 es una celda de mes vecino.
    renderMini({ todayTone: 'primary', month: 9, todayKey: '2026-09-29' });
    expect(hoy()).toHaveTextContent('29');
    expect(coloresDeTexto(hoy())).toEqual(['text-on-primary']);
  });

  it('sin la prop, la celda de hoy conserva exactamente sus clases de siempre (tablero y widgets sin cambios)', () => {
    renderMini();
    expect(hoy().className).toBe(
      'relative flex h-7 w-7 text-xs items-center justify-center rounded-pill font-medium transition-colors text-text-primary bg-accent font-bold text-on-accent  cursor-pointer hover:bg-surface-container',
    );
  });

  it('los días que no son hoy conservan su color de siempre con cualquiera de los dos tonos', () => {
    renderMini({ todayTone: 'primary' });
    expect(coloresDeTexto(screen.getByRole('button', { name: '20' }))).toEqual(['text-text-primary']);
    expect(coloresDeTexto(screen.getAllByRole('button', { name: '28' }).find((b) => b.classList.contains('text-text-disabled')) as HTMLElement)).toEqual(['text-text-disabled']);
  });
});

describe('MiniCalendar — días de meses vecinos legibles cuando se pueden pulsar (G05-R03)', () => {
  const coloresDeTexto = (el: HTMLElement) => [...el.classList].filter((c) => /^text-(text-|on-)/.test(c));
  const vecinos = () => [...document.querySelectorAll<HTMLElement>('button[data-adjacent-month="true"]')];
  const delMes = () => [...document.querySelectorAll<HTMLElement>('button[aria-pressed]:not([data-adjacent-month])')];

  it('sin la prop no cambia nada: los vecinos siguen en text-text-disabled (tablero y widgets compartidos)', () => {
    renderMini();
    // Octubre de 2026: 28–30 de septiembre y 1–8 de noviembre.
    expect(vecinos()).toHaveLength(11);
    for (const b of vecinos()) expect(coloresDeTexto(b)).toEqual(['text-text-disabled']);
    for (const b of delMes().filter((x) => x !== hoy())) expect(coloresDeTexto(b)).toEqual(['text-text-primary']);
  });

  it('con adjacentMonthTone="secondary" los vecinos usan text-text-secondary y el resto no cambia', () => {
    renderMini({ adjacentMonthTone: 'secondary' });
    for (const b of vecinos()) {
      expect(coloresDeTexto(b)).toEqual(['text-text-secondary']);
      expect(b.className).not.toMatch(/opacity-/);
    }
    for (const b of delMes().filter((x) => x !== hoy())) expect(coloresDeTexto(b)).toEqual(['text-text-primary']);
    // Con el acento por defecto, hoy conserva su cadena de clases de siempre.
    expect(coloresDeTexto(hoy())).toEqual(['text-text-primary', 'text-on-accent']);
  });

  it('se combina con todayTone="primary": hoy, la selección, las marcas y la navegación siguen igual', () => {
    const { onSelectDay, onNextMonth } = renderMini({ adjacentMonthTone: 'secondary', todayTone: 'primary', selectedKey: '2026-09-29' });
    expect(coloresDeTexto(hoy())).toEqual(['text-on-primary']);
    const seleccionado = vecinos().find((b) => b.textContent === '29') as HTMLElement;
    expect(seleccionado).toHaveAttribute('aria-pressed', 'true');
    expect(seleccionado).toHaveClass('bg-surface-container-high', 'text-text-secondary');
    fireEvent.click(vecinos().find((b) => b.textContent === '30') as HTMLElement);
    expect(onSelectDay).toHaveBeenCalledWith('2026-09-30');
    fireEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }));
    expect(onNextMonth).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('button[aria-pressed] > span[aria-hidden="true"]')).toHaveLength(1);
  });

  it('cuando hoy cae en un mes vecino conserva el color de hoy, no el de vecino', () => {
    renderMini({ adjacentMonthTone: 'secondary', todayTone: 'primary', todayKey: '2026-09-29' });
    expect(hoy()).toHaveAttribute('data-adjacent-month', 'true');
    expect(coloresDeTexto(hoy())).toEqual(['text-on-primary']);
  });
});
