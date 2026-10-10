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
