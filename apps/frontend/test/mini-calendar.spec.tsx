import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MiniCalendar } from '../components/calendar/mini-calendar';

afterEach(cleanup);

// Octubre 2026 (mes 9). El calendario es presentación pura: estas pruebas
// fijan su contrato para las dos vistas que lo comparten —la agenda del
// estudiante (solo `markedDates`) y el resumen de Sprints del panel de
// administración (`markedCounts` + `getDayLabel`)— sin datos de dominio.

function renderCalendar(props: Partial<React.ComponentProps<typeof MiniCalendar>> = {}) {
  const onPrevMonth = vi.fn();
  const onNextMonth = vi.fn();
  render(
    <MiniCalendar
      year={2026}
      month={9}
      onPrevMonth={onPrevMonth}
      onNextMonth={onNextMonth}
      markedDates={new Set<string>()}
      todayKey="2026-10-05"
      {...props}
    />,
  );
  return { onPrevMonth, onNextMonth };
}

/** Botón de un día del mes visible (los días de relleno repiten número). */
function dia(numero: number): HTMLElement {
  const boton = screen
    .getAllByRole('button')
    .find(
      (candidato) =>
        candidato.firstChild?.textContent === String(numero) &&
        !candidato.className.includes('text-text-disabled'),
    );
  if (!boton) throw new Error(`no se encontró el día ${numero}`);
  return boton;
}

describe('MiniCalendar', () => {
  it('muestra el mes, los siete encabezados y seis semanas completas', () => {
    renderCalendar();

    expect(screen.getByText('Octubre 2026')).toBeInTheDocument();
    expect(screen.getAllByText(/^[LMJVSD]$/)).toHaveLength(7);
    // 42 días + las dos flechas de navegación.
    expect(screen.getAllByRole('button')).toHaveLength(44);
  });

  it('navega con las flechas sin decidir él mismo el mes', () => {
    const { onPrevMonth, onNextMonth } = renderCalendar();

    fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }));

    expect(onPrevMonth).toHaveBeenCalledTimes(1);
    expect(onNextMonth).toHaveBeenCalledTimes(1);
  });

  it('el día actual es el que recibe por todayKey, no el del reloj del navegador', () => {
    renderCalendar({ todayKey: '2026-10-20' });

    expect(dia(20)).toHaveAttribute('aria-current', 'date');
    expect(dia(5)).not.toHaveAttribute('aria-current');
  });

  describe('uso existente (agenda del estudiante): solo markedDates', () => {
    it('marca con un punto los días indicados y ninguno más', () => {
      renderCalendar({ markedDates: new Set(['2026-10-08', '2026-10-12']) });

      expect(dia(8).querySelector('span[aria-hidden="true"]')).not.toBeNull();
      expect(dia(12).querySelector('span[aria-hidden="true"]')).not.toBeNull();
      expect(dia(9).querySelector('span')).toBeNull();
    });

    it('no dibuja el punto sobre el día de hoy ni muestra conteos o etiquetas', () => {
      renderCalendar({ markedDates: new Set(['2026-10-05', '2026-10-08']) });

      expect(dia(5).querySelector('span')).toBeNull();
      expect(document.querySelector('[data-slot="day-count"]')).toBeNull();
      expect(dia(8)).not.toHaveAttribute('aria-label');
    });

    it('sin onSelectDay los días no son interactivos', () => {
      renderCalendar({ markedDates: new Set(['2026-10-08']) });
      expect(dia(8)).toBeDisabled();
    });
  });

  describe('con conteos por día (resumen de Sprints)', () => {
    const counts = new Map([
      ['2026-10-05', 1],
      ['2026-10-08', 3],
      ['2026-10-12', 1],
    ]);

    it('un solo elemento se marca con el punto, sin número', () => {
      renderCalendar({ markedCounts: counts });

      expect(dia(12)).toHaveAttribute('data-marked', 'true');
      expect(dia(12).querySelector('[data-slot="day-count"]')).toBeNull();
      expect(dia(12).querySelectorAll('span[aria-hidden="true"]')).toHaveLength(1);
    });

    it('dos o más muestran además cuántos son', () => {
      renderCalendar({ markedCounts: counts });

      expect(dia(8).querySelector('[data-slot="day-count"]')).toHaveTextContent('3');
    });

    it('el día de hoy también se marca', () => {
      renderCalendar({ markedCounts: counts });

      expect(dia(5)).toHaveAttribute('aria-current', 'date');
      expect(dia(5)).toHaveAttribute('data-marked', 'true');
      expect(dia(5).querySelector('span[aria-hidden="true"]')).not.toBeNull();
    });

    it('un día sin elementos no lleva marca ni etiqueta', () => {
      renderCalendar({ markedCounts: counts, getDayLabel: (key, n) => `${key}: ${n}` });

      expect(dia(9)).not.toHaveAttribute('data-marked');
      expect(dia(9)).not.toHaveAttribute('aria-label');
      expect(dia(9).querySelector('span')).toBeNull();
    });

    it('expone un nombre accesible por día marcado, sin depender del color', () => {
      renderCalendar({
        markedCounts: counts,
        getDayLabel: (key, n) => `${key}, ${n} finalizaciones planificadas`,
      });

      expect(
        screen.getByRole('button', { name: '2026-10-08, 3 finalizaciones planificadas' }),
      ).toBe(dia(8));
      expect(dia(8)).toHaveAttribute('title', '2026-10-08, 3 finalizaciones planificadas');
    });

    it('nunca escribe texto libre dentro de una celda: solo el número del día y el conteo', () => {
      renderCalendar({ markedCounts: counts, getDayLabel: () => 'Proyecto con un nombre muy largo' });

      expect(dia(8).textContent).toBe('83');
    });
  });
});

// ─── Pruebas de develop (HU-184: tono de hoy, meses vecinos, estructura e interacción) ───

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

/**
 * G05-C08 (UI-15, UI-17): estructura y navegación del mini calendario, que
 * hasta ahora solo tenía pruebas de color. En esta rama el componente no tiene
 * `getDayLabel` ni `getDayHref` (existen en la rama administrativa): no se
 * prueban aquí ni se añaden; ver el plan de integración.
 */
describe('MiniCalendar — estructura del mes (G05-C08)', () => {
  const dias = () => [...document.querySelectorAll<HTMLElement>('button[aria-pressed]')];
  const delMes = () => dias().filter((b) => !b.hasAttribute('data-adjacent-month'));

  it('octubre de 2026: título, siete cabeceras de lunes a domingo y seis semanas completas', () => {
    renderMini();
    expect(screen.getByText('Octubre 2026')).toBeInTheDocument();
    const cabeceras = [...document.querySelectorAll('.grid.grid-cols-7')][0].children;
    expect([...cabeceras].map((c) => c.textContent)).toEqual(['L', 'M', 'M', 'J', 'V', 'S', 'D']);
    expect(dias()).toHaveLength(42);
    expect(delMes().map((b) => b.textContent?.trim())).toEqual(Array.from({ length: 31 }, (_, i) => String(i + 1)));
    // Lunes 28 de septiembre → domingo 8 de noviembre.
    expect(dias()[0]).toHaveTextContent('28');
    expect(dias().at(-1)).toHaveTextContent('8');
    expect(dias().slice(0, 3).every((b) => b.hasAttribute('data-adjacent-month'))).toBe(true);
  });

  it.each([
    [2026, 1, 'Febrero 2026', 28],
    [2028, 1, 'Febrero 2028', 29],
    [2026, 11, 'Diciembre 2026', 31],
    [2027, 0, 'Enero 2027', 31],
  ])('%i-%i se titula "%s", tiene %i días propios y siempre semanas completas', (year, month, titulo, total) => {
    renderMini({ year, month, todayKey: '2026-10-09', markedDates: new Set() });
    expect(screen.getByText(titulo)).toBeInTheDocument();
    expect(delMes()).toHaveLength(total);
    expect(dias().length % 7).toBe(0);
    expect(dias().length).toBeGreaterThanOrEqual(28);
  });

  it('hoy es el único con aria-current="date" y solo aparece si cae en la cuadrícula mostrada', () => {
    renderMini();
    expect(document.querySelectorAll('[aria-current="date"]')).toHaveLength(1);
    expect(hoy()).toHaveTextContent('9');
    cleanup();
    renderMini({ year: 2027, month: 2 });
    expect(document.querySelectorAll('[aria-current]')).toHaveLength(0);
  });

  it('como mucho un día seleccionado; sin selectedKey ninguno; un selectedKey de otro mes no marca nada', () => {
    renderMini({ selectedKey: '2026-10-21' });
    const marcados = dias().filter((b) => b.getAttribute('aria-pressed') === 'true');
    expect(marcados.map((b) => b.textContent?.trim())).toEqual(['21']);
    expect(marcados[0]).toHaveClass('bg-surface-container-high');
    cleanup();
    renderMini();
    expect(dias().filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(0);
    cleanup();
    renderMini({ selectedKey: '2027-03-21' });
    expect(dias().filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(0);
  });

  it('hoy seleccionado conserva el aspecto de hoy (no el fondo de selección) y sigue anunciándose como presionado', () => {
    renderMini({ selectedKey: '2026-10-09' });
    expect(hoy()).toHaveAttribute('aria-pressed', 'true');
    expect(hoy()).not.toHaveClass('bg-surface-container-high');
    expect(hoy()).toHaveClass('bg-accent');
  });

  it('marca con un punto decorativo cada día con actividad, también en meses vecinos, salvo hoy', () => {
    renderMini({ markedDates: new Set(['2026-10-20', '2026-09-29', '2026-11-03', '2026-10-09', '2026-12-25']) });
    const conMarca = dias().filter((b) => b.querySelector('span[aria-hidden="true"]'));
    expect(conMarca.map((b) => `${b.textContent?.trim()}${b.hasAttribute('data-adjacent-month') ? '*' : ''}`)).toEqual(['29*', '20', '3*']);
    for (const b of conMarca) expect(b.querySelector('span')).toHaveClass('bg-primary', 'rounded-pill');
    expect(hoy().querySelector('span')).toBeNull();
  });
});

describe('MiniCalendar — interacción (G05-C08)', () => {
  it('los controles de mes tienen nombre accesible, no envían formularios y avisan una vez por pulsación', () => {
    const { onPrevMonth, onNextMonth, onSelectDay } = renderMini();
    const anterior = screen.getByRole('button', { name: 'Mes anterior' });
    const siguiente = screen.getByRole('button', { name: 'Mes siguiente' });
    for (const control of [anterior, siguiente]) expect(control).toHaveAttribute('type', 'button');
    fireEvent.click(anterior);
    fireEvent.click(siguiente);
    fireEvent.click(siguiente);
    expect(onPrevMonth).toHaveBeenCalledTimes(1);
    expect(onNextMonth).toHaveBeenCalledTimes(2);
    expect(onSelectDay).not.toHaveBeenCalled();
  });

  it('elegir un día entrega su clave AAAA-MM-DD exacta, también para días de los meses vecinos y para hoy', () => {
    const { onSelectDay } = renderMini();
    const dia = (texto: string, vecino: boolean) =>
      [...document.querySelectorAll<HTMLElement>('button[aria-pressed]')].find((b) => b.textContent?.trim() === texto && b.hasAttribute('data-adjacent-month') === vecino) as HTMLElement;
    fireEvent.click(dia('1', false));
    fireEvent.click(dia('31', false));
    fireEvent.click(dia('28', true));
    fireEvent.click(dia('8', true));
    fireEvent.click(hoy());
    expect(onSelectDay.mock.calls.map(([clave]) => clave)).toEqual(['2026-10-01', '2026-10-31', '2026-09-28', '2026-11-08', '2026-10-09']);
  });

  it('el tamaño md agranda las celdas sin cambiar la estructura', () => {
    renderMini({ size: 'md' });
    const celdas = [...document.querySelectorAll<HTMLElement>('button[aria-pressed]')];
    expect(celdas).toHaveLength(42);
    for (const celda of celdas) expect(celda).toHaveClass('h-10', 'w-10');
  });

  it('es un componente controlado: con las mismas props dibuja lo mismo y no guarda mes ni selección propios', () => {
    renderMini({ selectedKey: '2026-10-21' });
    const foto = () => [...document.querySelectorAll('button[aria-pressed]')].map((b) => `${b.textContent?.trim()}:${b.getAttribute('aria-pressed')}`).join(',');
    const primera = foto();
    fireEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }));
    // Sin que quien lo usa cambie las props, el mes mostrado no se mueve.
    expect(screen.getByText('Octubre 2026')).toBeInTheDocument();
    expect(foto()).toBe(primera);
  });
});
