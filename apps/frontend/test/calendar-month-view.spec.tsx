import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MonthView } from '../components/calendar/month-view';
import { IconoTipoEvento, PRIORIDAD_BORDE, PRIORIDAD_DOT } from '../lib/calendar/paleta';
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

  it('un evento compartido OCUPADO se pinta como punto, sin ícono ni nombre de tipo (G01-C09, UI-01)', () => {
    const itemsByDay = new Map<string, AgendaItem[]>([
      [
        '2026-09-10',
        [{ ...evento(2, '2026-09-10', 'Ocupado'), ocupado: true, projectId: 0, projectTitle: '', href: '', compartidoPor: { idUsuario: 9, nombre: 'Ana', tono: 2 } }],
      ],
    ]);
    const { container } = render(
      <MonthView year={2026} month={8} todayKey="2026-09-27" selectedKey={null} itemsByDay={itemsByDay} onSelectDay={() => {}} />,
    );

    expect(screen.getByText('Ocupado')).toBeInTheDocument();
    expect(container.textContent).not.toContain('Otro');
    expect(container.querySelector('svg')).toBeNull();
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

describe('MonthView — fechas fuera del mes legibles (G04-C05, UI-14)', () => {
  function renderOctubre(selectedKey: string | null = null) {
    // La cuadrícula de octubre 2026 empieza el lunes 28 de septiembre y termina el 8 de noviembre.
    const itemsByDay = new Map<string, AgendaItem[]>([
      ['2026-09-29', [evento(1, '2026-09-29', 'Cierre de septiembre', 'ENTREGA')]],
      ['2026-10-09', [evento(2, '2026-10-09', 'Reunión de octubre', 'REUNION')]],
    ]);
    render(<MonthView year={2026} month={9} todayKey="2026-10-09" selectedKey={selectedKey} itemsByDay={itemsByDay} onSelectDay={() => {}} />);
    return {
      fuera: screen.getByRole('button', { name: 'martes, 29 de septiembre, 1 actividad' }),
      dentro: screen.getByRole('button', { name: 'martes, 6 de octubre, sin actividad' }),
      hoy: screen.getByRole('button', { name: 'Hoy, viernes, 9 de octubre, 1 actividad' }),
    };
  }
  const numero = (celda: HTMLElement) => celda.querySelector('span > span.type-meta.rounded-pill') as HTMLElement;
  /** ¿Algún ancestro (hasta la celda) atenúa este nodo con opacidad? */
  const atenuado = (nodo: HTMLElement, celda: HTMLElement) => {
    for (let n: HTMLElement | null = nodo; n && n !== celda.parentElement; n = n.parentElement) {
      if ([...n.classList].some((c) => c.startsWith('opacity-'))) return true;
    }
    return false;
  };

  it('el número de un día fuera del mes ya no hereda opacidad: usa text-text-secondary a opacidad completa', () => {
    const { fuera } = renderOctubre();
    expect(fuera.className).not.toMatch(/\bopacity-/);
    expect(numero(fuera)).toHaveTextContent('29');
    expect(numero(fuera)).toHaveClass('text-text-secondary');
    expect(atenuado(numero(fuera), fuera)).toBe(false);
  });

  it('lo que sigue atenuado es el contenido inactivo (chips y puntos), no la fecha', () => {
    const { fuera, dentro } = renderOctubre();
    const chip = [...fuera.querySelectorAll('span')].find((n) => n.textContent === 'Cierre de septiembre') as HTMLElement;
    expect(atenuado(chip, fuera)).toBe(true);
    // Un día del mes no tiene nada atenuado y conserva su borde; el de fuera sigue sin borde visible.
    expect(dentro.querySelector('[class*="opacity-"]')).toBeNull();
    expect(dentro).toHaveClass('border-outline-variant/40');
    expect(fuera).toHaveClass('border-transparent');
  });

  it('etiqueta accesible, selección, hoy y contenido de las celdas no cambian', () => {
    const { fuera, hoy } = renderOctubre('2026-09-29');
    expect(fuera).toHaveAttribute('aria-pressed', 'true');
    expect(fuera).toHaveClass('bg-surface-container-high');
    expect(fuera).not.toHaveAttribute('aria-current');
    expect(hoy).toHaveAttribute('aria-current', 'date');
    expect(hoy).toHaveClass('border-primary');
    expect(numero(hoy)).toHaveClass('bg-primary', 'text-on-primary');
    expect(numero(hoy)).not.toHaveClass('text-text-secondary');
    expect(screen.getAllByRole('button')).toHaveLength(42);
  });

  it('text-text-secondary alcanza 4.5:1 sobre la celda normal y la seleccionada, en claro y en oscuro', () => {
    const css = readFileSync(join(__dirname, '..', 'app', 'global.css'), 'utf8');
    const bloque = (encabezado: string) => {
      const abre = css.indexOf('{', css.indexOf(encabezado));
      let profundidad = 0;
      for (let i = abre; i < css.length; i += 1) {
        if (css[i] === '{') profundidad += 1;
        else if (css[i] === '}' && --profundidad === 0) return css.slice(abre + 1, i);
      }
      return '';
    };
    const token = (b: string, nombre: string) => (b.match(new RegExp(`--color-${nombre}:\\s*(#[0-9a-fA-F]{6})\\b`)) as RegExpMatchArray)[1];
    const luminancia = (hex: string) => {
      const canal = (i: number) => {
        const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
    };
    const contraste = (a: string, b: string) => {
      const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
      return (x + 0.05) / (y + 0.05);
    };
    // --color-text-secondary es un alias de on-surface-variant (global.css).
    expect(css).toMatch(/--color-text-secondary:\s*var\(--color-on-surface-variant\)/);
    for (const tema of [bloque('@theme {'), bloque('.dark {')]) {
      const texto = token(tema, 'on-surface-variant');
      expect(contraste(texto, token(tema, 'surface-container-lowest'))).toBeGreaterThanOrEqual(4.5);
      expect(contraste(texto, token(tema, 'surface-container-high'))).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('IconoTipoEvento y prioridades compartidas (G04-C12, UI-37)', () => {
  it('dibuja el cuadro con el tono recibido, el ícono decorativo y el nombre del tipo para lectores', () => {
    const { container } = render(<IconoTipoEvento tipo="ENTREGA" tono={4} />);
    const cuadro = container.firstElementChild as HTMLElement;
    expect(cuadro).toHaveClass('flex', 'h-3.5', 'w-3.5', 'shrink-0', 'rounded-control', 'bg-cal-4', 'text-on-cal-4');
    expect(cuadro).toHaveAttribute('title', 'Entrega');
    expect(cuadro.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(cuadro.querySelector('.sr-only')).toHaveTextContent('Entrega');
  });

  it('el tono es el que decide quien lo usa (p. ej. el de la persona en un evento compartido) y admite una clase extra', () => {
    const { container } = render(<IconoTipoEvento tipo="TUTORIA" tono={2} className="mt-0.5" />);
    const cuadro = container.firstElementChild as HTMLElement;
    expect(cuadro).toHaveClass('bg-cal-2', 'mt-0.5');
    expect(cuadro).not.toHaveClass('bg-cal-1');
    expect(cuadro).toHaveAttribute('title', 'Tutoría');
  });

  it('las prioridades conservan sus colores y significado', () => {
    expect(PRIORIDAD_DOT).toEqual({ ALTA: 'bg-status-error', MEDIA: 'bg-status-warning', BAJA: 'bg-outline-variant' });
    expect(PRIORIDAD_BORDE).toEqual({ ALTA: 'border-l-status-error', MEDIA: 'border-l-status-warning', BAJA: 'border-l-outline-variant' });
  });

  it('Mes sigue mostrando el ícono del tipo en un evento propio y solo un punto en uno OCUPADO', () => {
    const ocupado: AgendaItem = { ...(evento(3, '2026-10-06', 'Ocupado') as Extract<AgendaItem, { kind: 'evento' }>), ocupado: true, compartidoPor: { idUsuario: 9, nombre: 'Ana García', tono: 2 } };
    const itemsByDay = new Map<string, AgendaItem[]>([['2026-10-06', [evento(1, '2026-10-06', 'Revisión de sprint', 'ENTREGA'), ocupado]]]);
    render(<MonthView year={2026} month={9} todayKey="2026-10-09" selectedKey={null} itemsByDay={itemsByDay} onSelectDay={() => {}} />);
    const celda = screen.getByRole('button', { name: 'martes, 6 de octubre, 2 actividades' });
    expect(celda.querySelectorAll('[title="Entrega"]')).toHaveLength(1);
    expect(celda.querySelector('[title="Entrega"]')).toHaveClass('bg-cal-4');
    expect(celda.querySelector('[title="Otro"]')).toBeNull();
  });
});
