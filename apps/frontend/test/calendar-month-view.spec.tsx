import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MonthView } from '../components/calendar/month-view';
import type { AgendaItem } from '../lib/calendar/agenda';

afterEach(() => {
  cleanup();
});

function tarea(id: number, key: string, titulo: string): AgendaItem {
  return {
    kind: 'tarea',
    key,
    sortKey: '24:00',
    id,
    titulo,
    projectId: 1,
    projectTitle: 'Proyecto',
    href: `/dashboard/projects/1/kanban/tasks/${id}`,
    prioridad: 'MEDIA',
    estado: 'POR_HACER',
  };
}

function evento(id: number, key: string, titulo: string, tipo: 'TUTORIA' | 'REUNION' | 'ENTREGA' | 'OTRO' = 'OTRO'): AgendaItem {
  return {
    kind: 'evento',
    key,
    sortKey: '09:00',
    id,
    projectId: 1,
    titulo,
    descripcion: null,
    modalidad: 'VIRTUAL',
    tipo,
    multiDia: false,
    projectTitle: 'Proyecto',
    href: '/dashboard/projects/1',
    horaInicio: '09:00',
    horaFin: '10:00',
    fechaInicio: new Date(`${key}T09:00:00`),
    fechaFin: new Date(`${key}T10:00:00`),
  };
}

describe('MonthView (HU-169 T-264)', () => {
  it('muestra tareas y eventos del mes, distinguibles por texto/ícono, no solo color', () => {
    const itemsByDay = new Map<string, AgendaItem[]>([
      ['2026-09-10', [tarea(1, '2026-09-10', 'Entregar avance'), evento(2, '2026-09-10', 'Reunión de equipo')],
    ]]);

    render(
      <MonthView
        year={2026}
        month={8}
        todayKey="2026-09-27"
        selectedKey={null}
        itemsByDay={itemsByDay}
        onSelectDay={() => {}}
      />,
    );

    expect(screen.getByText('Entregar avance')).toBeInTheDocument();
    expect(screen.getByText('Reunión de equipo')).toBeInTheDocument();
  });

  it('un día con más de 3 ítems se agrupa con "+N más" en vez de desbordar', () => {
    const key = '2026-09-15';
    const itemsByDay = new Map<string, AgendaItem[]>([
      [key, [tarea(1, key, 'T1'), tarea(2, key, 'T2'), tarea(3, key, 'T3'), evento(4, key, 'E1')]],
    ]);

    render(
      <MonthView
        year={2026}
        month={8}
        todayKey="2026-09-27"
        selectedKey={null}
        itemsByDay={itemsByDay}
        onSelectDay={() => {}}
      />,
    );

    expect(screen.getByText('T1')).toBeInTheDocument();
    expect(screen.getByText('T2')).toBeInTheDocument();
    expect(screen.getByText('T3')).toBeInTheDocument();
    expect(screen.queryByText('E1')).not.toBeInTheDocument();
    expect(screen.getByText('+1 más')).toBeInTheDocument();
  });

  it('seleccionar un día dispara onSelectDay con su key', () => {
    const onSelectDay = vi.fn();
    const itemsByDay = new Map<string, AgendaItem[]>();

    render(
      <MonthView
        year={2026}
        month={8}
        todayKey="2026-09-27"
        selectedKey={null}
        itemsByDay={itemsByDay}
        onSelectDay={onSelectDay}
      />,
    );

    screen.getByText('27').closest('button')!.click();
    expect(onSelectDay).toHaveBeenCalledWith('2026-09-27');
  });

  it('sin ítems en el mes no rompe el render (estado vacío se maneja fuera de la rejilla)', () => {
    render(
      <MonthView
        year={2026}
        month={8}
        todayKey="2026-09-27"
        selectedKey={null}
        itemsByDay={new Map()}
        onSelectDay={() => {}}
      />,
    );

    expect(screen.queryByText(/más$/)).not.toBeInTheDocument();
  });

  it('marca hoy con aria-current y el texto "Hoy" (HU-184 T-324)', () => {
    render(
      <MonthView
        year={2026}
        month={8}
        todayKey="2026-09-27"
        selectedKey={null}
        itemsByDay={new Map()}
        onSelectDay={() => {}}
      />,
    );

    const hoy = screen.getByRole('button', { name: /^Hoy, domingo, 27 de septiembre/ });
    expect(hoy).toHaveAttribute('aria-current', 'date');
    expect(hoy).toHaveTextContent('Hoy');
    expect(screen.getAllByText('Hoy')).toHaveLength(1);
  });

  it('cada evento lleva el color e ícono de su tipo, con su nombre en texto (HU-184)', () => {
    const key = '2026-09-10';
    const itemsByDay = new Map<string, AgendaItem[]>([
      [key, [evento(1, key, 'Clase', 'TUTORIA'), evento(2, key, 'Llamada', 'REUNION'), evento(3, key, 'Informe', 'ENTREGA')]],
    ]);

    const { container } = render(
      <MonthView year={2026} month={8} todayKey="2026-09-27" selectedKey={null} itemsByDay={itemsByDay} onSelectDay={() => {}} />,
    );

    expect(screen.getByText('Tutoría')).toBeInTheDocument();
    expect(screen.getByText('Reunión')).toBeInTheDocument();
    expect(screen.getByText('Entrega')).toBeInTheDocument();
    // Puntos de la vista compacta (móvil): uno por ítem con el color de su tipo.
    expect(container.querySelector('span.bg-cal-1-strong.h-1\\.5')).not.toBeNull();
    expect(container.querySelector('span.bg-cal-3-strong.h-1\\.5')).not.toBeNull();
    expect(container.querySelector('span.bg-cal-4-strong.h-1\\.5')).not.toBeNull();
  });

  it('el nombre accesible del día dice cuántas actividades tiene (los títulos no caben en móvil)', () => {
    const key = '2026-09-10';
    const itemsByDay = new Map<string, AgendaItem[]>([[key, [tarea(1, key, 'T1'), evento(2, key, 'E1')]]]);

    render(
      <MonthView year={2026} month={8} todayKey="2026-09-27" selectedKey={null} itemsByDay={itemsByDay} onSelectDay={() => {}} />,
    );

    expect(screen.getByRole('button', { name: /10 de septiembre, 2 actividades$/ })).toBeInTheDocument();
  });
});
