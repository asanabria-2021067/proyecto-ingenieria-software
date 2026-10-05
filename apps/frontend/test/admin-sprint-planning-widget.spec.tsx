import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../lib/services/admin-sprints', () => ({ getAdminSprintCalendar: vi.fn() }));

import { AdminSprintPlanningWidget } from '../components/admin/dashboard/sprint-planning-widget';
import { getAdminSprintCalendar } from '../lib/services/admin-sprints';
import type { AdminSprintCalendar, AdminSprintCalendarItem } from '../lib/types/admin-sprints';

const getCalendarMock = vi.mocked(getAdminSprintCalendar);

let nextId = 1;
function item(overrides: Partial<AdminSprintCalendarItem> = {}): AdminSprintCalendarItem {
  const idSprint = nextId++;
  return {
    idSprint,
    numero: 1,
    estado: 'ACTIVO',
    idProyecto: idSprint + 100,
    tituloProyecto: `Proyecto ${idSprint}`,
    lider: { idUsuario: 7, nombre: 'Ana', apellido: 'López' },
    fechaInicio: '2026-09-20T15:00:00.000Z',
    fechaFinPlaneada: '2026-10-08',
    fechaFinalizacionIniciada: null,
    fechaCierre: null,
    situacion: 'EN_CURSO',
    diasRestantes: 3,
    desviacionDias: null,
    ...overrides,
  };
}

/** Los siete Sprints de demostración, tal como los clasifica el backend el 5 de octubre. */
function calendarioDemo(): AdminSprintCalendar {
  return {
    hoy: '2026-10-05',
    items: [
      item({ idSprint: 19, idProyecto: 1, tituloProyecto: 'Plataforma de Tutorías UVG', fechaFinPlaneada: '2026-10-04', situacion: 'PLAN_VENCIDO', diasRestantes: -1 }),
      item({ idSprint: 20, idProyecto: 2, tituloProyecto: 'App de Monitoreo Ambiental', fechaFinPlaneada: '2026-10-05', situacion: 'VENCE_HOY', diasRestantes: 0 }),
      item({ idSprint: 23, idProyecto: 28, tituloProyecto: 'Sistema de Tutorías Académicas UVG', fechaFinPlaneada: '2026-10-06', diasRestantes: 1 }),
      item({ idSprint: 124, idProyecto: 36, numero: 3, tituloProyecto: 'Tutorías — Sprint 6 Demo', fechaFinPlaneada: '2026-10-08', diasRestantes: 3 }),
      item({ idSprint: 152, idProyecto: 55, tituloProyecto: '[S7 UI] Portal de voluntariado UVG', fechaFinPlaneada: '2026-10-12', diasRestantes: 7 }),
      item({ idSprint: 125, idProyecto: 38, estado: 'EN_FINALIZACION', situacion: 'EN_FINALIZACION', tituloProyecto: 'Portal de Voluntariado', fechaFinPlaneada: '2026-08-15', fechaFinalizacionIniciada: '2026-08-16T05:26:14.746Z', diasRestantes: -51, desviacionDias: 0 }),
      item({ idSprint: 154, idProyecto: 56, numero: 2, estado: 'EN_FINALIZACION', situacion: 'EN_FINALIZACION', tituloProyecto: 'Feria tecnológica', fechaFinPlaneada: '2026-09-06', fechaFinalizacionIniciada: '2026-09-07T06:13:36.319Z', diasRestantes: -29, desviacionDias: 1 }),
    ],
    conteos: { EN_CURSO: 3, VENCE_HOY: 1, PLAN_VENCIDO: 1, EN_FINALIZACION: 2, SIN_FECHA: 0 },
    resumen: { proximos7Dias: 4, planVencido: 1 },
  };
}

function renderWidget() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<AdminSprintPlanningWidget />, { wrapper });
}

/** Botón de un día del mes visible. */
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

beforeEach(() => {
  nextId = 1;
  getCalendarMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('AdminSprintPlanningWidget', () => {
  it('se titula por finalizaciones esperadas, nunca por «cierres»', async () => {
    getCalendarMock.mockResolvedValue(calendarioDemo());
    renderWidget();

    const region = await screen.findByRole('region', { name: 'Próximas finalizaciones de Sprint' });
    expect(within(region).getByText('Supervisa las fechas esperadas de los Sprints activos.')).toBeInTheDocument();
    await screen.findByText('Octubre 2026');
    expect(region.textContent).not.toMatch(/cierre/i);
  });

  it('mientras carga muestra un esqueleto, no un spinner ni datos', () => {
    getCalendarMock.mockReturnValue(new Promise(() => {}));
    renderWidget();

    expect(screen.getByRole('status', { name: 'Cargando la planificación de Sprints' })).toBeInTheDocument();
    expect(screen.queryByText('Próximos 7 días')).not.toBeInTheDocument();
  });

  it('muestra las dos métricas tal como las calcula el backend', async () => {
    getCalendarMock.mockResolvedValue({ ...calendarioDemo(), resumen: { proximos7Dias: 42, planVencido: 17 } });
    renderWidget();

    const proximos = (await screen.findByText('Próximos 7 días')).parentElement as HTMLElement;
    const vencidos = screen.getByText('Plan vencido', { selector: 'dt' }).parentElement as HTMLElement;
    // 42 y 17 no salen de contar los items (serían 4 y 1): son el resumen del servidor.
    expect(within(proximos).getByText('42')).toBeInTheDocument();
    expect(within(vencidos).getByText('17')).toBeInTheDocument();
  });

  it('el plan vencido se resalta con el tono de atención solo cuando hay alguno', async () => {
    getCalendarMock.mockResolvedValue({ ...calendarioDemo(), resumen: { proximos7Dias: 4, planVencido: 0 } });
    renderWidget();

    const vencidos = (await screen.findByText('Plan vencido', { selector: 'dt' })).parentElement as HTMLElement;
    expect(within(vencidos).getByText('0').className).not.toContain('attention');
  });

  describe('mini calendario', () => {
    it('abre en el mes del día que informa el backend y lo resalta, aunque el reloj local diga otra cosa', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2031-03-15T12:00:00.000Z'));
      getCalendarMock.mockResolvedValue(calendarioDemo());
      renderWidget();

      expect(await screen.findByText('Octubre 2026')).toBeInTheDocument();
      expect(dia(5)).toHaveAttribute('aria-current', 'date');
    });

    it('marca únicamente los días con una finalización esperada', async () => {
      getCalendarMock.mockResolvedValue(calendarioDemo());
      renderWidget();
      await screen.findByText('Octubre 2026');

      for (const numero of [4, 5, 6, 8, 12]) {
        expect(dia(numero), `día ${numero}`).toHaveAttribute('data-marked', 'true');
      }
      // 20 de septiembre es el inicio de varios Sprints: el inicio no se marca.
      for (const numero of [7, 9, 13, 20]) {
        expect(dia(numero), `día ${numero}`).not.toHaveAttribute('data-marked');
      }
    });

    it('cada día marcado tiene un nombre accesible con la cantidad', async () => {
      getCalendarMock.mockResolvedValue(calendarioDemo());
      renderWidget();
      await screen.findByText('Octubre 2026');

      expect(screen.getByRole('button', { name: '8 de octubre, 1 finalización planificada' })).toBe(dia(8));
    });

    it('varios Sprints el mismo día muestran el conteo, sin nombres de proyecto en la celda', async () => {
      const calendario = calendarioDemo();
      calendario.items.push(
        item({ fechaFinPlaneada: '2026-10-08', tituloProyecto: 'Otro proyecto' }),
        item({ fechaFinPlaneada: '2026-10-08', tituloProyecto: 'Un tercero' }),
      );
      getCalendarMock.mockResolvedValue(calendario);
      renderWidget();
      await screen.findByText('Octubre 2026');

      expect(dia(8)).toHaveAccessibleName('8 de octubre, 3 finalizaciones planificadas');
      expect(dia(8).textContent).toBe('83');
    });

    it('navega entre meses y encuentra las finalizaciones de meses anteriores', async () => {
      getCalendarMock.mockResolvedValue(calendarioDemo());
      renderWidget();
      await screen.findByText('Octubre 2026');

      fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' }));
      expect(screen.getByText('Septiembre 2026')).toBeInTheDocument();
      expect(dia(6)).toHaveAccessibleName('6 de septiembre, 1 finalización planificada');

      fireEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }));
      fireEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }));
      expect(screen.getByText('Noviembre 2026')).toBeInTheDocument();
    });

    it('los días no abren ningún detalle: eso pertenece a la vista completa', async () => {
      getCalendarMock.mockResolvedValue(calendarioDemo());
      renderWidget();
      await screen.findByText('Octubre 2026');

      expect(dia(8)).toBeDisabled();
    });

    it('un Sprint sin fecha planificada no marca ningún día y se informa aparte', async () => {
      const calendario: AdminSprintCalendar = {
        hoy: '2026-10-05',
        items: [item({ fechaFinPlaneada: null, situacion: 'SIN_FECHA', diasRestantes: null })],
        conteos: { EN_CURSO: 0, VENCE_HOY: 0, PLAN_VENCIDO: 0, EN_FINALIZACION: 0, SIN_FECHA: 1 },
        resumen: { proximos7Dias: 0, planVencido: 0 },
      };
      getCalendarMock.mockResolvedValue(calendario);
      renderWidget();
      await screen.findByText('Octubre 2026');

      expect(document.querySelectorAll('[data-marked]')).toHaveLength(0);
      expect(screen.getByText('1 sin fecha planificada')).toBeInTheDocument();
      expect(screen.getByText('No hay finalizaciones próximas.')).toBeInTheDocument();
    });
  });

  describe('próxima finalización', () => {
    it('prioriza el Sprint que vence hoy y enlaza al detalle ADMINISTRATIVO del proyecto', async () => {
      getCalendarMock.mockResolvedValue(calendarioDemo());
      renderWidget();

      const etiqueta = await screen.findByText('Próxima finalización');
      const bloque = etiqueta.parentElement as HTMLElement;
      expect(within(bloque).getByText('Sprint 1')).toBeInTheDocument();
      expect(within(bloque).getByText('App de Monitoreo Ambiental')).toBeInTheDocument();
      expect(within(bloque).getByText('Vence hoy')).toBeInTheDocument();
      expect(within(bloque).getByText('5 oct · hoy')).toBeInTheDocument();
      expect(within(bloque).getByRole('link', { name: /Ver proyecto/ })).toHaveAttribute(
        'href',
        '/dashboard/admin/proyectos/2',
      );
    });

    it('sin Sprint que venza hoy muestra el siguiente en curso', async () => {
      const calendario = calendarioDemo();
      calendario.items = calendario.items.filter((sprint) => sprint.situacion !== 'VENCE_HOY');
      getCalendarMock.mockResolvedValue(calendario);
      renderWidget();

      const bloque = (await screen.findByText('Próxima finalización')).parentElement as HTMLElement;
      expect(within(bloque).getByText('Sistema de Tutorías Académicas UVG')).toBeInTheDocument();
      expect(within(bloque).getByText('6 oct · mañana')).toBeInTheDocument();
      expect(within(bloque).getByText('En curso')).toBeInTheDocument();
    });

    it('un Sprint en finalización nunca es la «próxima finalización»', async () => {
      const calendario = calendarioDemo();
      calendario.items = calendario.items.filter((sprint) => sprint.estado === 'EN_FINALIZACION');
      getCalendarMock.mockResolvedValue(calendario);
      renderWidget();

      expect(await screen.findByText('No hay finalizaciones próximas.')).toBeInTheDocument();
      expect(screen.getByText('2 en finalización')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /Ver proyecto/ })).not.toBeInTheDocument();
    });
  });

  it('el acceso a la vista completa se anuncia como próximo, sin enlazar a una ruta inexistente', async () => {
    getCalendarMock.mockResolvedValue(calendarioDemo());
    renderWidget();

    const cta = (await screen.findByText('Ver calendario de Sprints')).closest('[aria-disabled="true"]');
    expect(cta).not.toBeNull();
    expect(within(cta as HTMLElement).getByText('Próximamente')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /calendario de Sprints/i })).not.toBeInTheDocument();
    expect(document.querySelector('a[href="/dashboard/admin/sprints"]')).toBeNull();
  });

  it('sin Sprints operables lo dice como estado vacío, no como error', async () => {
    getCalendarMock.mockResolvedValue({
      hoy: '2026-10-05',
      items: [],
      conteos: { EN_CURSO: 0, VENCE_HOY: 0, PLAN_VENCIDO: 0, EN_FINALIZACION: 0, SIN_FECHA: 0 },
      resumen: { proximos7Dias: 0, planVencido: 0 },
    });
    renderWidget();

    expect(await screen.findByText('No hay Sprints operables para supervisar.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('Octubre 2026')).not.toBeInTheDocument();
  });

  it('si la consulta falla muestra un aviso discreto y permite reintentar', async () => {
    getCalendarMock.mockRejectedValueOnce(new Error('500'));
    renderWidget();

    const alerta = await screen.findByRole('alert');
    expect(within(alerta).getByText('No se pudo cargar la planificación de Sprints.')).toBeInTheDocument();

    getCalendarMock.mockResolvedValue(calendarioDemo());
    fireEvent.click(within(alerta).getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Octubre 2026')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(getCalendarMock).toHaveBeenCalledTimes(2);
  });

  it('métricas, calendario y próxima finalización salen de una sola petición', async () => {
    getCalendarMock.mockResolvedValue(calendarioDemo());
    renderWidget();

    await screen.findByText('Próxima finalización');
    await waitFor(() => expect(screen.getByText('Octubre 2026')).toBeInTheDocument());
    expect(getCalendarMock).toHaveBeenCalledTimes(1);
  });
});
