import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../lib/mensajes', () => ({ confirmar: vi.fn(), aviso: { exito: vi.fn(), error: vi.fn(), advertencia: vi.fn() } }));
vi.mock('../lib/services/events', () => ({ createEvent: vi.fn(), updateEvent: vi.fn(), deleteEvent: vi.fn() }));
vi.mock('../hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: { idUsuario: 1, nombre: 'Carlos', apellido: 'Mendoza', fotoUrl: null } }),
}));
vi.mock('../hooks/use-project-members', () => ({ useProjectMembers: () => ({ members: [], isLoading: false }) }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));

import { EventFormDialog, type LedProjectOption } from '../components/calendar/event-form-dialog';
import { esProyectoAgendable } from '../lib/calendar/proyectos-agendables';
import type { EventoProyectoDTO } from '../lib/services/events';

/**
 * GPI01-C08 (H-06). El selector de «Agendar actividad» ofrecía también los
 * proyectos cerrados, donde el backend rechaza la creación (409). Contrato
 * verificado contra una base aislada: SOLO `CERRADO` se rechaza; en solicitud
 * de cierre, en revisión u observado se aceptan y por eso siguen elegibles.
 */

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

afterEach(cleanup);

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

const proyecto = (idProyecto: number, estadoProyecto: string): LedProjectOption => ({
  idProyecto,
  tituloProyecto: `Proyecto ${estadoProyecto}`,
  estadoProyecto,
});

const ACEPTADOS = ['PUBLICADO', 'EN_PROGRESO', 'EN_SOLICITUD_CIERRE', 'EN_REVISION', 'OBSERVADO'];

function abrirSelector() {
  fireEvent.click(screen.getByRole('combobox', { name: 'Proyecto' }));
}

describe('GPI01-C08: esProyectoAgendable', () => {
  it.each(ACEPTADOS)('%s admite eventos nuevos', (estado) => {
    expect(esProyectoAgendable(estado)).toBe(true);
  });

  it('CERRADO no admite eventos nuevos', () => {
    expect(esProyectoAgendable('CERRADO')).toBe(false);
  });

  it('sin estado conocido no se restringe (el backend decide)', () => {
    expect(esProyectoAgendable(undefined)).toBe(true);
  });
});

describe('GPI01-C08: selector de proyecto de «Agendar actividad»', () => {
  it('los proyectos cerrados aparecen deshabilitados y marcados; el resto se puede elegir', () => {
    const proyectos = [...ACEPTADOS.map((estado, i) => proyecto(i + 1, estado)), proyecto(90, 'CERRADO')];
    render(<EventFormDialog open onOpenChange={vi.fn()} ledProjects={proyectos} defaultProjectId={1} />, { wrapper });
    abrirSelector();

    for (const estado of ACEPTADOS) {
      expect(screen.getByRole('option', { name: `Proyecto ${estado}` })).not.toHaveAttribute('data-disabled');
    }
    const cerrado = screen.getByRole('option', { name: 'Proyecto CERRADO · Cerrado' });
    expect(cerrado).toHaveAttribute('data-disabled');
    expect(cerrado).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('con un proyecto elegible el formulario se puede enviar', () => {
    render(<EventFormDialog open onOpenChange={vi.fn()} ledProjects={[proyecto(1, 'EN_PROGRESO')]} defaultProjectId={1} />, { wrapper });
    expect(screen.getByRole('button', { name: 'Agendar evento' })).toBeEnabled();
  });

  it('si todos están cerrados lo explica y no deja enviar', () => {
    render(<EventFormDialog open onOpenChange={vi.fn()} ledProjects={[proyecto(90, 'CERRADO'), proyecto(91, 'CERRADO')]} />, { wrapper });

    expect(screen.getByRole('status')).toHaveTextContent(
      'Ninguno de tus proyectos admite actividades nuevas: los proyectos cerrados son de solo lectura.',
    );
    expect(screen.getByRole('button', { name: 'Agendar evento' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeEnabled();
  });

  it('sin proyectos tampoco deja enviar', () => {
    render(<EventFormDialog open onOpenChange={vi.fn()} ledProjects={[]} />, { wrapper });
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agendar evento' })).toBeDisabled();
  });

  it('al editar un evento de un proyecto cerrado se conserva su proyecto y no aparece el aviso', () => {
    const evento: EventoProyectoDTO = {
      idEvento: 7,
      idProyecto: 90,
      tituloEvento: 'Reunión de cierre',
      descripcionEvento: null,
      fechaInicio: new Date(Date.now() + 864e5).toISOString(),
      fechaFin: new Date(Date.now() + 864e5 + 36e5).toISOString(),
      antelacionMinutos: 60,
      modalidad: 'VIRTUAL',
      ubicacionLat: null,
      ubicacionLng: null,
      ubicacionNombre: null,
      linkSesion: 'https://meet.google.com/abc',
      rolesDestino: [],
      tipoEvento: 'REUNION',
      invitados: [],
    };
    render(<EventFormDialog open onOpenChange={vi.fn()} ledProjects={[proyecto(90, 'CERRADO')]} editingEvent={evento} />, { wrapper });

    expect(screen.getByRole('combobox', { name: 'Proyecto' })).toHaveTextContent('Proyecto CERRADO');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled();
  });
});
