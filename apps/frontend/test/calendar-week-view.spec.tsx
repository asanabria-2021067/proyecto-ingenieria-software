import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { WeekView } from '../components/calendar/week-view';
import type { CalendarDay } from '../lib/calendar/utils';
import type { AgendaItem } from '../lib/calendar/agenda';

afterEach(() => {
  cleanup();
});

function days(): CalendarDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(2026, 8, 7 + i);
    const key = `2026-09-${String(7 + i).padStart(2, '0')}`;
    return { date, key, inCurrentMonth: true };
  });
}

function tarea(id: number, key: string): AgendaItem {
  return {
    kind: 'tarea',
    key,
    sortKey: '24:00',
    id,
    titulo: 'Entregar avance',
    projectTitle: 'Proyecto',
    href: `/dashboard/projects/1/kanban/tasks/${id}`,
    prioridad: 'ALTA',
    estado: 'PENDIENTE',
  };
}

function evento(id: number, key: string): AgendaItem {
  return {
    kind: 'evento',
    key,
    sortKey: '09:00',
    id,
    projectId: 1,
    titulo: 'Reunión de equipo',
    descripcion: null,
    projectTitle: 'Proyecto',
    href: '/dashboard/projects/1',
    horaInicio: '09:00',
    horaFin: '10:00',
    fechaInicio: new Date(`${key}T09:00:00`),
    fechaFin: new Date(`${key}T10:00:00`),
  };
}

describe('WeekView (HU-169 T-264)', () => {
  it('muestra la fecha límite de la tarea y el evento del mismo día, sin recargar', () => {
    const key = '2026-09-10';
    const itemsByDay = new Map<string, AgendaItem[]>([[key, [evento(1, key), tarea(2, key)]]]);

    render(
      <WeekView
        days={days()}
        todayKey="2026-09-27"
        itemsByDay={itemsByDay}
        isEventEditable={() => false}
        onEditEvento={() => {}}
      />,
    );

    expect(screen.getByText('Entregar avance')).toBeInTheDocument();
    expect(screen.getByText('Reunión de equipo')).toBeInTheDocument();
    expect(screen.getByText('09:00')).toBeInTheDocument();
  });

  it('un día sin actividad muestra el estado vacío del día', () => {
    render(
      <WeekView
        days={days()}
        todayKey="2026-09-27"
        itemsByDay={new Map()}
        isEventEditable={() => false}
        onEditEvento={() => {}}
      />,
    );

    expect(screen.getAllByText('Sin actividad')).toHaveLength(7);
  });

  it('evento editable (proyecto liderado) se abre para editar, no navega', () => {
    const key = '2026-09-10';
    const itemsByDay = new Map<string, AgendaItem[]>([[key, [evento(1, key)]]]);
    const onEditEvento = vi.fn();

    render(
      <WeekView
        days={days()}
        todayKey="2026-09-27"
        itemsByDay={itemsByDay}
        isEventEditable={() => true}
        onEditEvento={onEditEvento}
      />,
    );

    screen.getByText('Reunión de equipo').closest('button')!.click();
    expect(onEditEvento).toHaveBeenCalled();
  });
});
