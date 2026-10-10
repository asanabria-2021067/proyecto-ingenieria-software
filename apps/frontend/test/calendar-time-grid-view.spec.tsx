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

  it('un evento compartido OCUPADO solo anuncia "Ocupado" y su horario: sin tipo, modalidad ni proyecto (G01-C09, UI-01)', () => {
    const key = '2026-10-07';
    const { container } = render(
      <TimeGridView
        days={semana()}
        todayKey="2026-10-06"
        itemsByDay={
          new Map([
            [
              key,
              [
                evento(5, key, {
                  titulo: 'Ocupado',
                  projectId: 0,
                  projectTitle: '',
                  href: '',
                  tipo: 'OTRO',
                  modalidad: 'VIRTUAL',
                  ocupado: true,
                  compartidoPor: { idUsuario: 9, nombre: 'Ana García', tono: 4 },
                }),
                tarea(6, key, { titulo: 'Fecha límite', projectId: 0, projectTitle: '', href: '', ocupado: true, compartidoPor: { idUsuario: 9, nombre: 'Ana García', tono: 4 } }),
              ],
            ],
          ])
        }
        onSelectEvento={() => {}}
        ahora={AHORA}
      />,
    );

    const bloque = screen.getByRole('button', { name: 'Ocupado, 09:00 a 10:30, calendario de Ana García' });
    expect(bloque).toHaveClass('bg-cal-4', 'border-dashed');
    expect(bloque.textContent).toContain('Ana García');
    expect(bloque.querySelector('svg')).toBeNull(); // sin ícono de modalidad
    expect(container.textContent).not.toMatch(/Otro|Virtual|Proyecto/);
    expect(screen.getByText('Fecha límite')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('un evento 23:00 → 01:00 llega como dos tramos con hora y se dibuja en la cuadrícula, no en "Todo el día" (G02-C05, UI-05)', () => {
    const tramoA = evento(9, '2026-10-08', {
      titulo: 'Hackathon',
      horaInicio: '23:00',
      horaFin: '00:00',
      fechaInicio: new Date(2026, 9, 8, 23, 0),
      fechaFin: new Date(2026, 9, 9, 0, 0),
    });
    const tramoB = evento(9, '2026-10-09', {
      titulo: 'Hackathon',
      horaInicio: '00:00',
      horaFin: '01:00',
      fechaInicio: new Date(2026, 9, 9, 0, 0),
      fechaFin: new Date(2026, 9, 9, 1, 0),
    });
    render(
      <TimeGridView
        days={semana()}
        todayKey="2026-10-06"
        itemsByDay={new Map([['2026-10-08', [tramoA]], ['2026-10-09', [tramoB]]])}
        onSelectEvento={() => {}}
        ahora={AHORA}
      />,
    );

    expect(screen.queryByText('Todo el día')).not.toBeInTheDocument();
    const bloqueA = screen.getByRole('button', { name: 'Hackathon, 23:00 a 00:00 del día siguiente' });
    expect(bloqueA).toHaveStyle({ top: `${23 * 48 + 1}px`, height: `${48 - 2}px` });
    const bloqueB = screen.getByRole('button', { name: 'Hackathon, 00:00 a 01:00' });
    expect(bloqueB).toHaveStyle({ top: '1px', height: `${48 - 2}px` });
  });

  it('un evento que termina exactamente a las 00:00 ocupa hasta el final de su día y no aparece al siguiente', () => {
    const unico = evento(10, '2026-10-08', {
      titulo: 'Cierre',
      horaInicio: '22:00',
      horaFin: '00:00',
      fechaInicio: new Date(2026, 9, 8, 22, 0),
      fechaFin: new Date(2026, 9, 9, 0, 0),
    });
    render(
      <TimeGridView days={semana()} todayKey="2026-10-06" itemsByDay={new Map([['2026-10-08', [unico]]])} onSelectEvento={() => {}} ahora={AHORA} />,
    );

    expect(screen.queryByText('Todo el día')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Cierre/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Cierre, 22:00 a 00:00 del día siguiente' })).toHaveStyle({ height: `${2 * 48 - 2}px` });
  });

  it('un ítem sin partir cuyo fin cae en otra fecha se recorta a las 24:00 del día, nunca "antes" del inicio', () => {
    const sinPartir = evento(11, '2026-10-08', {
      titulo: 'Guardia',
      horaInicio: '23:00',
      horaFin: '01:00',
      fechaInicio: new Date(2026, 9, 8, 23, 0),
      fechaFin: new Date(2026, 9, 9, 1, 0),
    });
    render(
      <TimeGridView days={semana()} todayKey="2026-10-06" itemsByDay={new Map([['2026-10-08', [sinPartir]]])} onSelectEvento={() => {}} ahora={AHORA} />,
    );
    expect(screen.getByRole('button', { name: /^Guardia/ })).toHaveStyle({ top: `${23 * 48 + 1}px`, height: `${48 - 2}px` });
  });

  it('en Día todas las fechas límite de la franja son alcanzables; en Semana "+N más" es un botón que abre ese día (G02-C06, UI-13)', () => {
    const key = '2026-10-08';
    const cuatro = [1, 2, 3, 4].map((n) => tarea(n, key));
    const dia = { date: new Date(2026, 9, 8), key, inCurrentMonth: true };

    const { unmount } = render(
      <TimeGridView days={[dia]} todayKey="2026-10-06" itemsByDay={new Map([[key, cuatro]])} onSelectEvento={() => {}} ahora={AHORA} />,
    );
    expect(screen.getAllByRole('link', { name: /^Tarea \d/ })).toHaveLength(4);
    expect(screen.queryByText(/más$/)).not.toBeInTheDocument();
    unmount();

    const onVerDia = vi.fn();
    render(
      <TimeGridView days={semana()} todayKey="2026-10-06" itemsByDay={new Map([[key, cuatro]])} onSelectEvento={() => {}} onVerDia={onVerDia} ahora={AHORA} />,
    );
    expect(screen.getAllByRole('link', { name: /^Tarea \d/ })).toHaveLength(3);
    const mas = screen.getByRole('button', { name: '1 actividad más de todo el día, ver el día' });
    expect(mas).toHaveTextContent('+1 más');
    fireEvent.click(mas);
    expect(onVerDia).toHaveBeenCalledWith(key);
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

  it('en Semana, más de 2 eventos solapados se resumen en "+N" que abre el día; en Día se ven todos', () => {
    const key = '2026-10-07';
    const tres = new Map<string, AgendaItem[]>([
      [
        key,
        [
          evento(1, key),
          evento(2, key, { fechaInicio: new Date(`${key}T09:15:00`), horaInicio: '09:15' }),
          evento(3, key, { fechaInicio: new Date(`${key}T09:30:00`), horaInicio: '09:30' }),
        ],
      ],
    ]);
    const onVerDia = vi.fn();
    const { rerender } = render(
      <TimeGridView days={semana()} todayKey="2026-10-06" itemsByDay={tres} onSelectEvento={() => {}} onVerDia={onVerDia} ahora={AHORA} />,
    );

    expect(screen.getByRole('button', { name: /^Evento 1/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Evento 2/ })).not.toBeInTheDocument();
    const mas = screen.getByRole('button', { name: '2 eventos más a esta hora, ver el día' });
    expect(mas).toHaveTextContent('+2');
    fireEvent.click(mas);
    expect(onVerDia).toHaveBeenCalledWith(key);

    const dia = semana().filter((d) => d.key === key);
    rerender(<TimeGridView days={dia} todayKey="2026-10-06" itemsByDay={tres} onSelectEvento={() => {}} ahora={AHORA} />);
    expect(screen.getAllByRole('button', { name: /^Evento \d/ })).toHaveLength(3);
    expect(screen.queryByRole('button', { name: /eventos más/ })).not.toBeInTheDocument();
  });
});

describe('TimeGridView — ancho útil en Semana (G02-C11, UI-02)', () => {
  it('en Semana la cuadrícula tiene un ancho mínimo y scroll horizontal interno; en Día no', () => {
    const key = '2026-10-08';
    const { unmount } = render(
      <TimeGridView days={semana()} todayKey="2026-10-06" itemsByDay={new Map([[key, [evento(1, key)]]])} onSelectEvento={() => {}} ahora={AHORA} />,
    );
    expect(screen.getByTestId('cuadricula-semana')).toHaveClass('overflow-x-auto');
    expect(screen.getByTestId('cuadricula-horas')).toHaveClass('min-w-[48rem]');
    unmount();

    render(
      <TimeGridView
        days={[{ date: new Date(2026, 9, 8), key, inCurrentMonth: true }]}
        todayKey="2026-10-06"
        itemsByDay={new Map([[key, [evento(1, key)]]])}
        onSelectEvento={() => {}}
        ahora={AHORA}
      />,
    );
    expect(screen.getByTestId('cuadricula-semana')).not.toHaveClass('overflow-x-auto');
    expect(screen.getByTestId('cuadricula-horas')).not.toHaveClass('min-w-[48rem]');
  });
});

describe('TimeGridView — eventos breves (G02-C12, UI-04/UI-18)', () => {
  it.each([
    ['15 min', '09:15'],
    ['30 min', '09:30'],
  ])('un evento de %s muestra su título en pantalla en una sola línea con la hora, y mide 32 px', (_caso, horaFin) => {
    const key = '2026-10-08';
    const corto = evento(21, key, {
      titulo: 'Stand-up rápido',
      horaFin,
      fechaFin: new Date(`${key}T${horaFin}:00`),
    });
    render(
      <TimeGridView days={semana()} todayKey="2026-10-06" itemsByDay={new Map([[key, [corto]]])} onSelectEvento={() => {}} ahora={AHORA} />,
    );

    const bloque = screen.getByRole('button', { name: `Stand-up rápido, 09:00 a ${horaFin}` });
    expect(bloque).toHaveTextContent('09:00 · Stand-up rápido');
    expect(bloque).not.toHaveTextContent(`09:00 – ${horaFin}`);
    expect(bloque).toHaveStyle({ top: `${9 * 48 + 1}px`, height: `${32 - 2}px` });
  });

  it('un evento de una hora conserva las dos líneas (rango de horas y título) y el pie con la modalidad', () => {
    const key = '2026-10-08';
    render(
      <TimeGridView days={semana()} todayKey="2026-10-06" itemsByDay={new Map([[key, [evento(22, key, { titulo: 'Reunión larga' })]]])} onSelectEvento={() => {}} ahora={AHORA} />,
    );
    const bloque = screen.getByRole('button', { name: 'Reunión larga, 09:00 a 10:30' });
    expect(bloque).toHaveTextContent('09:00 – 10:30');
    expect(bloque).toHaveTextContent('Reunión larga');
    expect(bloque).toHaveTextContent('Proyecto Uno');
  });

  it('dos eventos breves solapados siguen repartiéndose la columna y ambos muestran su título', () => {
    const key = '2026-10-08';
    const a = evento(23, key, { titulo: 'A corto', horaFin: '09:15', fechaFin: new Date(`${key}T09:15:00`) });
    const b = evento(24, key, { titulo: 'B corto', horaInicio: '09:10', horaFin: '09:25', fechaInicio: new Date(`${key}T09:10:00`), fechaFin: new Date(`${key}T09:25:00`) });
    render(<TimeGridView days={semana()} todayKey="2026-10-06" itemsByDay={new Map([[key, [a, b]]])} onSelectEvento={() => {}} ahora={AHORA} />);
    expect(screen.getByRole('button', { name: /^A corto/ })).toHaveTextContent('A corto');
    expect(screen.getByRole('button', { name: /^B corto/ })).toHaveTextContent('B corto');
    expect(screen.getByRole('button', { name: /^A corto/ })).toHaveStyle({ width: 'calc(50% - 4px)' });
  });
});
