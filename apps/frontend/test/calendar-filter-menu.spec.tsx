import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { CalendarFilterMenu } from '../components/calendar/calendar-filter-menu';
import { TIPO_EVENTO_ESTILO, TIPOS_EVENTO_EN_ORDEN, TONO_CLASES } from '../lib/calendar/paleta';
import { contarItems, filtrarItems } from '../lib/calendar/vista';
import type { AgendaItem } from '../lib/calendar/agenda';
import type { TipoEvento } from '../lib/services/events';

/**
 * G05-C07 (UI-15, UI-34): el menú "Todos los eventos (N)" no tenía pruebas
 * propias. Primero el componente solo (leyenda, estados, teclado) y después
 * unido a `filtrarItems`/`contarItems` reales con el mismo cableado que la
 * página, para fijar qué deja visible cada filtro, incluidos los bloques
 * «Ocupado» de calendarios compartidos (G05-R01).
 */
afterEach(() => {
  cleanup();
});

const ETIQUETAS = TIPOS_EVENTO_EN_ORDEN.map((t) => TIPO_EVENTO_ESTILO[t].label);

function renderMenu(overrides: Partial<Pick<Parameters<typeof CalendarFilterMenu>[0], 'total' | 'mostrarTareas' | 'tiposOcultos'>> = {}) {
  const espias = { onToggleTareas: vi.fn(), onToggleTipo: vi.fn(), onMostrarTodo: vi.fn() };
  render(<CalendarFilterMenu total={14} mostrarTareas tiposOcultos={new Set<TipoEvento>()} {...espias} {...overrides} />);
  return espias;
}

// Con el menú abierto Radix marca el resto de la página como aria-hidden (menú modal): por eso `hidden: true`.
const disparador = () => screen.getByRole('button', { name: /Todos los eventos|Eventos filtrados/, hidden: true });
async function abrir() {
  // Radix abre el menú con teclado sin depender de PointerEvent (que jsdom no implementa completo).
  fireEvent.keyDown(disparador(), { key: 'Enter' });
  return screen.findByRole('menu');
}
const opcion = (nombre: string) => screen.getByRole('menuitemcheckbox', { name: nombre });

describe('CalendarFilterMenu — disparador y leyenda (G05-C07)', () => {
  it('sin filtros dice "Todos los eventos (N)"; con cualquier filtro, "Eventos filtrados (N)"', () => {
    renderMenu({ total: 14 });
    expect(disparador()).toHaveTextContent('Todos los eventos (14)');
    expect(disparador()).toHaveAttribute('aria-haspopup', 'menu');
    expect(disparador()).toHaveAttribute('aria-expanded', 'false');
    cleanup();
    renderMenu({ total: 3, tiposOcultos: new Set<TipoEvento>(['OTRO']) });
    expect(disparador()).toHaveTextContent('Eventos filtrados (3)');
    cleanup();
    renderMenu({ total: 9, mostrarTareas: false });
    expect(disparador()).toHaveTextContent('Eventos filtrados (9)');
    cleanup();
    renderMenu({ total: 0 });
    expect(disparador()).toHaveTextContent('Todos los eventos (0)');
  });

  it('el menú lista las fechas límite y los seis tipos en su orden, todos marcados cuando no hay filtros', async () => {
    renderMenu();
    const menu = await abrir();
    expect(disparador()).toHaveAttribute('aria-expanded', 'true');
    const casillas = within(menu).getAllByRole('menuitemcheckbox');
    expect(casillas.map((c) => c.textContent)).toEqual(['Fechas límite de tareas', ...ETIQUETAS]);
    expect(ETIQUETAS).toEqual(['Tutoría', 'Reunión', 'Entrega', 'Revisión', 'Taller', 'Otro']);
    for (const casilla of casillas) expect(casilla).toHaveAttribute('aria-checked', 'true');
    expect(within(menu).getByText('Mostrar')).toBeInTheDocument();
    expect(within(menu).getByText('Tipos de actividad')).toBeInTheDocument();
  });

  it('cada tipo lleva el punto de color de su tono (por token, no por valor) y el punto es decorativo: el nombre lo da el texto', async () => {
    renderMenu();
    await abrir();
    for (const tipo of TIPOS_EVENTO_EN_ORDEN) {
      const { label, tono } = TIPO_EVENTO_ESTILO[tipo];
      const punto = opcion(label).querySelector('span.rounded-pill') as HTMLElement;
      expect(punto).toHaveAttribute('aria-hidden', 'true');
      for (const clase of TONO_CLASES[tono].punto.split(' ')) expect(punto).toHaveClass(clase);
      expect(punto.textContent).toBe('');
    }
    // Dos tipos distintos no comparten tono: la leyenda distingue los seis.
    expect(new Set(TIPOS_EVENTO_EN_ORDEN.map((t) => TIPO_EVENTO_ESTILO[t].tono)).size).toBe(6);
  });

  it('refleja lo oculto con aria-checked="false" y solo entonces ofrece "Mostrar todo"', async () => {
    renderMenu({ mostrarTareas: false, tiposOcultos: new Set<TipoEvento>(['ENTREGA', 'OTRO']) });
    await abrir();
    expect(opcion('Fechas límite de tareas')).toHaveAttribute('aria-checked', 'false');
    expect(opcion('Entrega')).toHaveAttribute('aria-checked', 'false');
    expect(opcion('Otro')).toHaveAttribute('aria-checked', 'false');
    for (const visible of ['Tutoría', 'Reunión', 'Revisión', 'Taller']) expect(opcion(visible)).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitem', { name: 'Mostrar todo' })).toBeInTheDocument();
    cleanup();
    renderMenu();
    await abrir();
    expect(screen.queryByRole('menuitem', { name: 'Mostrar todo' })).not.toBeInTheDocument();
  });
});

describe('CalendarFilterMenu — acciones y teclado (G05-C07)', () => {
  it('alternar un tipo avisa de ese tipo y el menú sigue abierto para marcar varios seguidos', async () => {
    const props = renderMenu();
    await abrir();
    fireEvent.click(opcion('Reunión'));
    fireEvent.click(opcion('Otro'));
    fireEvent.click(opcion('Fechas límite de tareas'));
    expect(props.onToggleTipo.mock.calls).toEqual([['REUNION'], ['OTRO']]);
    expect(props.onToggleTareas).toHaveBeenCalledTimes(1);
    expect(props.onMostrarTodo).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('"Mostrar todo" avisa una vez y cierra el menú', async () => {
    const props = renderMenu({ tiposOcultos: new Set<TipoEvento>(['OTRO']) });
    await abrir();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mostrar todo' }));
    expect(props.onMostrarTodo).toHaveBeenCalledTimes(1);
    expect(props.onToggleTipo).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('con teclado: Enter abre con el foco dentro del menú, Enter o Espacio sobre una opción la alternan y Escape cierra devolviendo el foco al disparador', async () => {
    // El recorrido con flechas (foco itinerante de Radix) se comprueba en navegador real, en el E2E de navegación.
    const props = renderMenu();
    const menu = await abrir();
    await waitFor(() => expect(menu.contains(document.activeElement)).toBe(true));
    const casillas = within(menu).getAllByRole('menuitemcheckbox');
    casillas.at(-1)?.focus();
    fireEvent.keyDown(casillas.at(-1) as HTMLElement, { key: ' ' });
    casillas[1].focus();
    fireEvent.keyDown(casillas[1], { key: 'Enter' });
    expect(props.onToggleTipo.mock.calls).toEqual([['OTRO'], ['TUTORIA']]);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.keyDown(menu, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(disparador()).toHaveFocus();
    expect(disparador()).toHaveAttribute('aria-expanded', 'false');
  });

  it('el disparador es un botón que no envía formularios y su ícono es decorativo', () => {
    renderMenu();
    expect(disparador()).toHaveAttribute('type', 'button');
    for (const icono of disparador().querySelectorAll('svg')) expect(icono).toHaveAttribute('aria-hidden', 'true');
  });
});

// ---------------------------------------------------------------------------------------------
// Menú + filtros reales, con el mismo cableado que app/dashboard/calendario/page.tsx.
// ---------------------------------------------------------------------------------------------
const ANA = { idUsuario: 9, nombre: 'Ana', tono: 2 as const };

function evento(id: number, titulo: string, tipo: TipoEvento, extra: Partial<Extract<AgendaItem, { kind: 'evento' }>> = {}): AgendaItem {
  return {
    kind: 'evento', key: '2026-10-09', sortKey: '09:00', id, projectId: 1, titulo, descripcion: null, modalidad: 'VIRTUAL', tipo, multiDia: false,
    projectTitle: 'Proyecto Uno', href: '', horaInicio: '09:00', horaFin: '10:00', fechaInicio: new Date(2026, 9, 9, 9), fechaFin: new Date(2026, 9, 9, 10), ...extra,
  };
}
function tarea(id: number, titulo: string, extra: Partial<Extract<AgendaItem, { kind: 'tarea' }>> = {}): AgendaItem {
  return { kind: 'tarea', key: '2026-10-09', sortKey: '', id, projectId: 1, titulo, projectTitle: 'Proyecto Uno', href: '', prioridad: 'MEDIA', estado: 'POR_HACER', ...extra } as AgendaItem;
}

const PROPIOS: AgendaItem[] = [
  evento(1, 'Tutoría de cálculo', 'TUTORIA'),
  evento(2, 'Reunión semanal', 'REUNION'),
  evento(3, 'Asunto propio', 'OTRO'),
  evento(4, 'Demo del proyecto Dos', 'REVISION', { projectId: 2, projectTitle: 'Proyecto Dos' }),
  tarea(5, 'Informe final'),
];
const COMPARTIDOS_DE_ANA: AgendaItem[] = [
  evento(900, 'Ocupado', 'OTRO', { projectId: 0, projectTitle: '', compartidoPor: ANA, ocupado: true }),
  evento(901, 'Revisión con Ana', 'REVISION', { compartidoPor: ANA }),
  evento(902, 'Otro asunto de Ana', 'OTRO', { compartidoPor: ANA }),
  tarea(903, 'Fecha límite', { projectId: 0, projectTitle: '', compartidoPor: ANA, ocupado: true }),
];

/** Mismo estado y mismas llamadas que la página; `anaActiva` y el proyecto oculto se controlan con dos botones. */
function Arnes() {
  const [mostrarTareas, setMostrarTareas] = useState(true);
  const [tiposOcultos, setTiposOcultos] = useState<Set<TipoEvento>>(new Set());
  const [proyectosOcultos, setProyectosOcultos] = useState<Set<number>>(new Set());
  const [anaActiva, setAnaActiva] = useState(true);
  const visibles = filtrarItems([...PROPIOS, ...(anaActiva ? COMPARTIDOS_DE_ANA : [])], { mostrarTareas, tiposOcultos, proyectosOcultos });
  return (
    <div>
      <CalendarFilterMenu
        total={contarItems(visibles)}
        mostrarTareas={mostrarTareas}
        onToggleTareas={() => setMostrarTareas((v) => !v)}
        tiposOcultos={tiposOcultos}
        onToggleTipo={(tipo) => setTiposOcultos((previo) => { const s = new Set(previo); if (!s.delete(tipo)) s.add(tipo); return s; })}
        onMostrarTodo={() => { setMostrarTareas(true); setTiposOcultos(new Set()); }}
      />
      <button type="button" onClick={() => setProyectosOcultos((p) => (p.has(1) ? new Set() : new Set([1])))}>alternar Proyecto Uno</button>
      <button type="button" onClick={() => setAnaActiva((v) => !v)}>alternar calendario de Ana</button>
      <ul aria-label="visibles">
        {visibles.map((i) => (
          <li key={`${i.kind}-${i.id}`}>{i.compartidoPor ? `${i.titulo} (Ana)` : i.titulo}</li>
        ))}
      </ul>
    </div>
  );
}

const visibles = () => [...document.querySelectorAll('ul[aria-label="visibles"] > li')].map((li) => li.textContent);
async function alternar(...nombres: string[]) {
  if (!screen.queryByRole('menu')) await abrir();
  for (const nombre of nombres) fireEvent.click(opcion(nombre));
}

describe('filtros del calendario sobre los ítems reales (G05-C07, UI-15/UI-34)', () => {
  const TODO = ['Tutoría de cálculo', 'Reunión semanal', 'Asunto propio', 'Demo del proyecto Dos', 'Informe final', 'Ocupado (Ana)', 'Revisión con Ana (Ana)', 'Otro asunto de Ana (Ana)', 'Fecha límite (Ana)'];

  it('sin filtros se ve todo y el contador lo cuenta todo', () => {
    render(<Arnes />);
    expect(visibles()).toEqual(TODO);
    expect(disparador()).toHaveTextContent('Todos los eventos (9)');
  });

  it('ocultar un tipo quita los eventos de ese tipo, propios y compartidos con detalle, y actualiza el contador', async () => {
    render(<Arnes />);
    await alternar('Revisión');
    expect(visibles()).toEqual(TODO.filter((t) => !['Demo del proyecto Dos', 'Revisión con Ana (Ana)'].includes(t)));
    expect(disparador()).toHaveTextContent('Eventos filtrados (7)');
    expect(opcion('Revisión')).toHaveAttribute('aria-checked', 'false');
  });

  it('G05-R01: ocultar «Otro» quita el evento propio y el compartido con detalle de ese tipo, pero el bloque Ocupado sigue y se cuenta', async () => {
    render(<Arnes />);
    await alternar('Otro');
    expect(visibles()).toEqual(TODO.filter((t) => !['Asunto propio', 'Otro asunto de Ana (Ana)'].includes(t)));
    expect(visibles()).toContain('Ocupado (Ana)');
    expect(disparador()).toHaveTextContent('Eventos filtrados (7)');
  });

  it('G05-R01: con los seis tipos ocultos solo quedan las fechas límite y el Ocupado; al desactivar a su propietaria desaparece también', async () => {
    render(<Arnes />);
    await alternar(...ETIQUETAS);
    expect(visibles()).toEqual(['Informe final', 'Ocupado (Ana)', 'Fecha límite (Ana)']);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'alternar calendario de Ana' }));
    expect(visibles()).toEqual(['Informe final']);
    expect(disparador()).toHaveTextContent('Eventos filtrados (1)');
  });

  it('ocultar las fechas límite quita las propias y las ajenas (también la «Fecha límite» sin detalle), no los eventos', async () => {
    render(<Arnes />);
    await alternar('Fechas límite de tareas');
    expect(visibles()).toEqual(TODO.filter((t) => !['Informe final', 'Fecha límite (Ana)'].includes(t)));
    expect(visibles()).toContain('Ocupado (Ana)');
  });

  it('ocultar un proyecto mío quita solo lo mío de ese proyecto: lo compartido de Ana no depende de mis proyectos', async () => {
    render(<Arnes />);
    fireEvent.click(screen.getByRole('button', { name: 'alternar Proyecto Uno' }));
    // Se van mis cuatro ítems del Proyecto Uno; "Revisión con Ana" es del mismo proyecto (id 1) pero viene de su calendario.
    expect(visibles()).toEqual(['Demo del proyecto Dos', 'Ocupado (Ana)', 'Revisión con Ana (Ana)', 'Otro asunto de Ana (Ana)', 'Fecha límite (Ana)']);
    // El filtro de proyectos no cuenta como "filtrado" del menú de tipos.
    expect(disparador()).toHaveTextContent('Todos los eventos (5)');
  });

  it('los filtros se combinan y "Mostrar todo" restablece tipos y fechas límite sin tocar el filtro de proyectos', async () => {
    render(<Arnes />);
    fireEvent.click(screen.getByRole('button', { name: 'alternar Proyecto Uno' }));
    await alternar('Revisión', 'Fechas límite de tareas');
    expect(visibles()).toEqual(['Ocupado (Ana)', 'Otro asunto de Ana (Ana)']);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mostrar todo' }));
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(visibles()).toEqual(['Demo del proyecto Dos', 'Ocupado (Ana)', 'Revisión con Ana (Ana)', 'Otro asunto de Ana (Ana)', 'Fecha límite (Ana)']);
    expect(disparador()).toHaveTextContent('Todos los eventos (5)');
  });

  it('volver a marcar un tipo lo devuelve tal cual estaba', async () => {
    render(<Arnes />);
    await alternar('Otro');
    await alternar('Otro');
    expect(visibles()).toEqual(TODO);
    expect(disparador()).toHaveTextContent('Todos los eventos (9)');
  });
});
