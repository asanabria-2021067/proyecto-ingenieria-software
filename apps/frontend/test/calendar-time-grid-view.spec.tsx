import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TimeGridView } from '../components/calendar/time-grid-view';
import type { AgendaItem } from '../lib/calendar/agenda';
import type { CalendarDay } from '../lib/calendar/utils';

afterEach(() => {
  cleanup();
});

function semana(): CalendarDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(2026, 9, 5 + i);
    return { date, key: `2026-10-${String(5 + i).padStart(2, '0')}`, inCurrentMonth: true };
  });
}

function evento(id: number, key: string, overrides: Partial<Extract<AgendaItem, { kind: 'evento' }>> = {}): AgendaItem {
  return {
    kind: 'evento',
    key,
    sortKey: '09:00',
    id,
    projectId: 1,
    titulo: `Evento ${id}`,
    descripcion: null,
    modalidad: 'VIRTUAL',
    tipo: 'TUTORIA',
    multiDia: false,
    projectTitle: 'Proyecto Uno',
    href: '/dashboard/projects/1',
    horaInicio: '09:00',
    horaFin: '10:30',
    fechaInicio: new Date(`${key}T09:00:00`),
    fechaFin: new Date(`${key}T10:30:00`),
    ...overrides,
  };
}

function tarea(id: number, key: string, overrides: Partial<Extract<AgendaItem, { kind: 'tarea' }>> = {}): AgendaItem {
  return {
    kind: 'tarea',
    key,
    sortKey: '24:00',
    id,
    titulo: `Tarea ${id}`,
    projectId: 1,
    projectTitle: 'Proyecto Uno',
    href: `/dashboard/projects/1/kanban/tasks/${id}`,
    prioridad: 'ALTA',
    estado: 'POR_HACER',
    ...overrides,
  };
}

const AHORA = new Date(2026, 9, 6, 13, 30);

describe('TimeGridView (HU-184 T-324)', () => {
  it('muestra los 7 días con hoy resaltado y las horas de la jornada', () => {
    const { container } = render(
      <TimeGridView days={semana()} todayKey="2026-10-06" itemsByDay={new Map()} onSelectEvento={() => {}} ahora={AHORA} />,
    );
    const hoy = container.querySelectorAll('[aria-current="date"]');
    expect(hoy).toHaveLength(1);
    expect(hoy[0]).toHaveTextContent('6');
    expect(screen.getByText('08:00')).toBeInTheDocument();
    expect(screen.getByText('20:00')).toBeInTheDocument();
  });

  it('el evento se ubica por hora con su color de tipo y abre su detalle al hacer clic', () => {
    const onSelectEvento = vi.fn();
    const key = '2026-10-07';
    render(
      <TimeGridView
        days={semana()}
        todayKey="2026-10-06"
        itemsByDay={new Map([[key, [evento(1, key)]]])}
        onSelectEvento={onSelectEvento}
        ahora={AHORA}
      />,
    );

    const bloque = screen.getByRole('button', { name: 'Evento 1, 09:00 a 10:30' });
    expect(bloque).toHaveClass('bg-cal-1', 'border-l-cal-1-strong');
    expect(bloque.style.top).toBe('433px'); // 9 h * 48 px + 1 px de margen
    fireEvent.click(bloque);
    expect(onSelectEvento).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
  });

  it('las fechas límite y los eventos de varios días van en "Todo el día"', () => {
    const key = '2026-10-08';
    render(
      <TimeGridView
        days={semana()}
        todayKey="2026-10-06"
        itemsByDay={new Map([[key, [tarea(3, key), evento(4, key, { multiDia: true, titulo: 'Congreso' })]]])}
        onSelectEvento={() => {}}
        ahora={AHORA}
      />,
    );

    expect(screen.getByText('Todo el día')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Tarea 3/ })).toHaveAttribute('href', '/dashboard/projects/1/kanban/tasks/3');
    expect(screen.getByRole('button', { name: 'Congreso' })).toBeInTheDocument();
  });

  it('un evento de un calendario compartido usa el color de la persona y lo dice', () => {
    const key = '2026-10-07';
    render(
      <TimeGridView
        days={semana()}
        todayKey="2026-10-06"
        itemsByDay={
          new Map([[key, [evento(5, key, { compartidoPor: { idUsuario: 9, nombre: 'Ana García', tono: 4 } })]]])
        }
        onSelectEvento={() => {}}
        ahora={AHORA}
      />,
    );

    const bloque = screen.getByRole('button', { name: /calendario de Ana García/ });
    expect(bloque).toHaveClass('bg-cal-4', 'border-dashed');
  });

  it('una tarea compartida no es un enlace', () => {
    const key = '2026-10-08';
    render(
      <TimeGridView
        days={semana()}
        todayKey="2026-10-06"
        itemsByDay={new Map([[key, [tarea(6, key, { href: '', compartidoPor: { idUsuario: 9, nombre: 'Ana', tono: 2 } })]]])}
        onSelectEvento={() => {}}
        ahora={AHORA}
      />,
    );

    expect(screen.getByText('Tarea 6')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Tarea 6/ })).not.toBeInTheDocument();
  });

  it('dos eventos solapados comparten el ancho de la columna', () => {
    const key = '2026-10-07';
    render(
      <TimeGridView
        days={semana()}
        todayKey="2026-10-06"
        itemsByDay={
          new Map([
            [
              key,
              [
                evento(1, key),
                evento(2, key, { fechaInicio: new Date(`${key}T09:30:00`), horaInicio: '09:30' }),
              ],
            ],
          ])
        }
        onSelectEvento={() => {}}
        ahora={AHORA}
      />,
    );

    expect(screen.getByRole('button', { name: /^Evento 1/ }).style.width).toBe('calc(50% - 4px)');
    expect(screen.getByRole('button', { name: /^Evento 2/ }).style.left).toBe('calc(50% + 2px)');
  });
});
