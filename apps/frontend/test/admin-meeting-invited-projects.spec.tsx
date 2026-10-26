import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { EquipoDeProyectoReunion, MotivoNoElegible, ProyectoElegibleReunion } from '../lib/types/admin-meetings';

const servicios = vi.hoisted(() => ({
  getEligibleMeetingProjects: vi.fn(),
  getMeetingProjectTeam: vi.fn(),
}));
vi.mock('../lib/services/admin-meetings', () => servicios);

import { InvitedProjectsField } from '../components/admin/meetings/invited-projects-field';

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === 'undefined') {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

const elegible = (idProyecto: number, tituloProyecto: string, lider: string, extra: Partial<ProyectoElegibleReunion> = {}): ProyectoElegibleReunion => {
  const [nombre, apellido] = lider.split(' ');
  return { idProyecto, tituloProyecto, estadoProyecto: 'EN_PROGRESO', lider: { idUsuario: idProyecto * 10, nombre, apellido }, integrantesConvocables: 3, cierreOficial: null, ventanaHasta: null, ...extra };
};
const ELEGIBLES = [
  elegible(1, 'Huerto Comunitario', 'Valeria Ortiz'),
  elegible(2, 'Plataforma de Tutorías', 'Luis Gómez'),
  elegible(3, 'Portal de Voluntariado', 'Ana Ruiz', { estadoProyecto: 'CERRADO', ventanaHasta: '2026-12-20T00:00:00.000Z' }),
];
const RANGO = { fechaInicio: new Date(2026, 9, 27, 9), fechaFin: new Date(2026, 9, 27, 10) };

function Harness({ inicial = [], motivos = new Map(), conocidos = new Map(), error }: {
  inicial?: number[];
  motivos?: Map<number, MotivoNoElegible>;
  conocidos?: Map<number, string>;
  error?: string;
}) {
  const [value, setValue] = useState<number[]>(inicial);
  return (
    <>
      <InvitedProjectsField value={value} onChange={setValue} rango={RANGO} conocidos={conocidos} motivos={motivos} error={error} />
      <output data-testid="valor">{value.join(',')}</output>
    </>
  );
}

function renderField(props: Parameters<typeof Harness>[0] = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Harness {...props} />
    </QueryClientProvider>,
  );
}

/** El único buscador de proyectos (el input real, no un botón que abre otro). */
const buscador = () => screen.getByRole('combobox', { name: 'Buscar proyecto para invitar' });
const opciones = () => screen.queryAllByRole('option').map((o) => o.textContent ?? '');
const valor = () => screen.getByTestId('valor').textContent;

beforeEach(() => {
  servicios.getEligibleMeetingProjects.mockResolvedValue(ELEGIBLES);
});
afterEach(cleanup);

describe('Proyectos invitados — selección múltiple', () => {
  it('consulta los elegibles del horario de la reunión y arranca con el buscador y el contador en cero', async () => {
    renderField();
    expect(screen.getByRole('group', { name: 'Proyectos invitados' })).toHaveAccessibleDescription('Selecciona los equipos que participarán en esta reunión.');
    expect(screen.getByText('0 proyectos seleccionados')).toBeInTheDocument();
    await waitFor(() => expect(servicios.getEligibleMeetingProjects).toHaveBeenCalledWith(RANGO));

    fireEvent.focus(buscador());
    await waitFor(() => expect(opciones()).toHaveLength(3));
    expect(opciones()[0]).toMatch(/Huerto Comunitario.*Líder: Valeria Ortiz.*3 personas/);
    expect(opciones()[2]).toMatch(/Cerrado, convocable hasta/);
  });

  it('elegir un proyecto lo muestra en una tarjeta con su líder, lo quita de las opciones y permite agregar otro', async () => {
    renderField();
    fireEvent.focus(buscador());
    fireEvent.click(await screen.findByRole('option', { name: /Plataforma de Tutorías/ }));

    const seleccion = screen.getByRole('list', { name: 'Proyectos seleccionados' });
    expect(within(seleccion).getByText('Plataforma de Tutorías')).toBeInTheDocument();
    expect(within(seleccion).getByText('Líder: Luis Gómez')).toBeInTheDocument();
    expect(screen.getByText('1 proyecto seleccionado')).toBeInTheDocument();
    expect(screen.getByText('Los integrantes elegibles de los proyectos seleccionados recibirán una convocatoria.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Agregar otro proyecto' }));
    await waitFor(() => expect(opciones()).toHaveLength(2));
    expect(opciones().join('|')).not.toMatch(/Plataforma de Tutorías/);
    fireEvent.click(screen.getByRole('option', { name: /Huerto Comunitario/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar otro proyecto' }));
    fireEvent.click(await screen.findByRole('option', { name: /Portal de Voluntariado/ }));

    expect(valor()).toBe('2,1,3');
    expect(screen.getByText('3 proyectos seleccionados')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar otro proyecto' }));
    expect(await screen.findByText('Ya invitaste a todos los proyectos elegibles.')).toBeInTheDocument();
  });

  it('quitar un proyecto actualiza la selección y lo devuelve a las opciones', async () => {
    renderField({ inicial: [1, 2] });
    expect(await screen.findByText('Líder: Valeria Ortiz')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Huerto Comunitario de la reunión' }));
    expect(valor()).toBe('2');
    fireEvent.click(screen.getByRole('button', { name: 'Agregar otro proyecto' }));
    expect(await screen.findByRole('option', { name: /Huerto Comunitario/ })).toBeInTheDocument();
  });

  it('un proyecto elegido que ya no es convocable en el horario no se pierde: su tarjeta lo explica', async () => {
    servicios.getMeetingProjectTeam.mockResolvedValue({ lider: { idUsuario: 90, nombre: 'Rita', apellido: 'Paz' } } as EquipoDeProyectoReunion);
    renderField({ inicial: [9], conocidos: new Map([[9, 'Feria Tecnológica']]) });
    expect(await screen.findByText('No se puede convocar en este horario. Cámbialo o quítalo de la reunión.')).toBeInTheDocument();
    expect(screen.getByText('Feria Tecnológica')).toBeInTheDocument();
    expect(await screen.findByText('Líder: Rita Paz')).toBeInTheDocument();
    expect(valor()).toBe('9');
  });

  it('muestra el motivo del rechazo del servidor y el error de selección vacía', async () => {
    renderField({ inicial: [3], motivos: new Map([[3, 'FUERA_DE_VENTANA_POSCIERRE']]) });
    expect(await screen.findByText('La reunión queda fuera de los dos meses posteriores al cierre oficial.')).toBeInTheDocument();
    cleanup();
    renderField({ error: 'Invita al menos un proyecto.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Invita al menos un proyecto.');
  });

  it('hay un solo buscador: enfocarlo despliega los resultados debajo, sin un segundo campo, y Escape los cierra', async () => {
    renderField();
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    fireEvent.focus(buscador());
    await waitFor(() => expect(opciones()).toHaveLength(3));
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    expect(screen.getAllByPlaceholderText('Buscar proyecto para invitar…')).toHaveLength(1);
    // Los resultados viven dentro de la sección (en el flujo), no en una capa flotante aparte.
    expect(screen.getByRole('group', { name: 'Proyectos invitados' })).toContainElement(screen.getByRole('listbox'));
    fireEvent.keyDown(buscador(), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Buscar proyecto para invitar' })).toBeInTheDocument();
  });

  it('sin proyectos elegibles lo dice en el buscador', async () => {
    servicios.getEligibleMeetingProjects.mockResolvedValue([]);
    renderField();
    fireEvent.focus(buscador());
    expect(await screen.findByText('No hay proyectos que se puedan convocar en este horario.')).toBeInTheDocument();
  });
});

const equipo = (idProyecto: number, overrides: Partial<EquipoDeProyectoReunion> = {}): EquipoDeProyectoReunion => ({
  idProyecto,
  tituloProyecto: ELEGIBLES.find((p) => p.idProyecto === idProyecto)?.tituloProyecto ?? `Proyecto ${idProyecto}`,
  descripcionProyecto: 'Huertos urbanos en el campus.',
  estadoProyecto: 'EN_PROGRESO',
  lider: { idUsuario: 10, nombre: 'Valeria', apellido: 'Ortiz', estadoCuenta: 'ACTIVO', convocado: true },
  integrantes: [
    { idUsuario: 11, nombre: 'Mía', apellido: 'Ruiz', estadoCuenta: 'ACTIVO', convocado: true, rol: 'Diseño', estadoParticipacion: 'ACTIVO' },
    { idUsuario: 12, nombre: 'Saúl', apellido: 'Paz', estadoCuenta: 'INACTIVO', convocado: false, rol: 'Backend', estadoParticipacion: 'ACTIVO' },
  ],
  totalConvocados: 2,
  ...overrides,
});

describe('Proyectos invitados — detalles de la tarjeta', () => {
  it('«Ver detalles» despliega la misma tarjeta con título, descripción, líder y estudiantes, y se vuelve a contraer', async () => {
    servicios.getMeetingProjectTeam.mockResolvedValue(equipo(1));
    renderField({ inicial: [1] });
    const ver = await screen.findByRole('button', { name: 'Ver detalles de Huerto Comunitario' });
    expect(ver).toHaveAttribute('aria-expanded', 'false');
    expect(servicios.getMeetingProjectTeam).not.toHaveBeenCalled();

    fireEvent.click(ver);
    const ocultar = screen.getByRole('button', { name: 'Ocultar detalles de Huerto Comunitario' });
    expect(ocultar).toHaveAttribute('aria-expanded', 'true');
    const detalles = document.getElementById(ocultar.getAttribute('aria-controls')!)!;
    expect(await within(detalles).findByText('Huertos urbanos en el campus.')).toBeInTheDocument();
    expect(within(detalles).getByText('Huerto Comunitario')).toBeInTheDocument();
    expect(within(detalles).getByText('Valeria Ortiz')).toBeInTheDocument();
    expect(within(detalles).getByText('Estudiantes participantes')).toBeInTheDocument();
    expect(within(detalles).getByText('Mía Ruiz')).toBeInTheDocument();
    expect(within(detalles).getByText('Backend · Cuenta no activa: no recibe la convocatoria')).toBeInTheDocument();
    expect(detalles.textContent).not.toMatch(/@/);

    fireEvent.click(ocultar);
    expect(screen.getByRole('button', { name: 'Ver detalles de Huerto Comunitario' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Mía Ruiz')).not.toBeInTheDocument();
  });

  it('varias tarjetas pueden estar abiertas y cada proyecto se consulta una sola vez', async () => {
    servicios.getMeetingProjectTeam.mockImplementation(async (id: number) =>
      equipo(id, id === 2 ? { descripcionProyecto: null, integrantes: [], estadoProyecto: 'CERRADO' } : {}),
    );
    renderField({ inicial: [1, 2] });
    fireEvent.click(await screen.findByRole('button', { name: 'Ver detalles de Huerto Comunitario' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalles de Plataforma de Tutorías' }));
    expect(await screen.findByText('Este proyecto no tiene descripción.')).toBeInTheDocument();
    expect(screen.getByText('Sin integrantes además del líder.')).toBeInTheDocument();
    expect(screen.getByText('Mía Ruiz')).toBeInTheDocument();
    // Cerrar y volver a abrir usa la caché.
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar detalles de Huerto Comunitario' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalles de Huerto Comunitario' }));
    expect(await screen.findByText('Mía Ruiz')).toBeInTheDocument();
    expect(servicios.getMeetingProjectTeam.mock.calls.map(([id]) => id).sort()).toEqual([1, 2]);
  });

  it('en un proyecto cerrado marca al equipo al cierre', async () => {
    servicios.getMeetingProjectTeam.mockResolvedValue(
      equipo(3, {
        estadoProyecto: 'CERRADO',
        integrantes: [{ idUsuario: 13, nombre: 'Rita', apellido: 'Paz', estadoCuenta: 'ACTIVO', convocado: true, rol: 'QA', estadoParticipacion: 'COMPLETADO' }],
      }),
    );
    renderField({ inicial: [3] });
    fireEvent.click(await screen.findByRole('button', { name: 'Ver detalles de Portal de Voluntariado' }));
    expect(await screen.findByText('QA · Equipo al cierre')).toBeInTheDocument();
  });

  it('si los detalles fallan lo dice y permite reintentar', async () => {
    servicios.getMeetingProjectTeam.mockRejectedValueOnce(new Error('caído')).mockResolvedValue(equipo(1));
    renderField({ inicial: [1] });
    fireEvent.click(await screen.findByRole('button', { name: 'Ver detalles de Huerto Comunitario' }));
    expect(await screen.findByText('No se pudieron cargar los detalles del proyecto.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Mía Ruiz')).toBeInTheDocument();
  });
});
